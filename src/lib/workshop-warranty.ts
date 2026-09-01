import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { notifyAdmins, escapeHtml } from "@/lib/notifications";
import { transporter, isSmtpConfigured, FROM } from "@/lib/mailer";
import { portalBaseUrl } from "@/lib/portal-tokens";
import { activateInstallationWarrantyTx, allocateInstallationTx } from "@/lib/warranty";

const log = createLogger("lib/workshop-warranty");

type Tx = Prisma.TransactionClient;

/**
 * Fase 4 — lo que pasa cuando una orden de trabajo se termina.
 *
 * Tres cosas, y el orden importa:
 *
 *   1. **Dentro de la transacción que cierra la OT:** reservar un sub-código en
 *      cada rollo que se usó y activarlo con los datos que la OT ya tiene. El
 *      instalador no vuelve a tipear el nombre del cliente ni la patente.
 *   2. **Después del commit:** mandarle el mail al cliente final.
 *   3. Si el mail falla, la OT **queda terminada igual**. No se revierte.
 *
 * El punto 3 es la regla que el plan marcó como no negociable, y tiene una
 * razón: el trabajo se hizo. Revertir una orden terminada porque el servidor de
 * mail estaba caído dejaría al taller sin poder cerrar el día por algo que no
 * tiene nada que ver con él.
 *
 * ─── Una garantía por rollo, no por orden ──────────────────────────────────
 *
 * Si un auto lleva lámina de dos rollos distintos (pasa: el parabrisas suele ir
 * con otro tono que los laterales), se genera **una instalación por cada
 * rollo**. La cadena de garantías de Kristall es por rollo justamente para eso:
 * si mañana hay un reclamo, hay que poder decir de qué lámina física era.
 *
 * La OT apunta a la del rollo que puso más metros —la principal—, porque
 * `WorkOrder.warrantyInstallationId` es uno solo. Las otras existen igual y se
 * ven en el stock y en el listado de instalaciones; no quedan huérfanas.
 */

export interface ResultadoGarantia {
  /** Instalaciones activadas, la principal primera. */
  generadas: {
    installationId: string;
    installationCode: string;
    activationToken: string;
    rollId: string;
    fullRollCode: string;
    expiresAt: Date;
  }[];
  /** Rollos que no pudieron generar garantía, con el motivo. */
  problemas: { fullRollCode: string; motivo: string }[];
}

/**
 * Genera y activa las garantías de una OT. Corre DENTRO de la transacción del
 * que llama.
 *
 * No tira si algo no se puede: junta los problemas y los devuelve. Un rollo
 * agotado no puede impedirle al taller cerrar el trabajo — se reporta, se
 * avisa a un admin, y alguien lo resuelve a mano.
 */
export async function generarGarantiasDeOrden(
  tx: Tx,
  orderId: string
): Promise<ResultadoGarantia> {
  const order = await tx.workOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      finishedAt: true,
      notes: true,
      warrantyInstallationId: true,
      contactId: true,
      workshopClient: { select: { name: true, email: true, phone: true, dni: true } },
      asset: { select: { type: true, identifier: true, brand: true, model: true, year: true } },
      items: { select: { rollId: true, squareMetersUsed: true } },
    },
  });

  const resultado: ResultadoGarantia = { generadas: [], problemas: [] };
  if (!order) return resultado;

  // Ya tiene garantía: no se generan dos veces. La transición a TERMINADA no
  // se puede repetir (de TERMINADA solo se sale a ENTREGADA), pero el chequeo
  // es barato y hace la función segura de llamar de nuevo.
  if (order.warrantyInstallationId) return resultado;

  // Los rollos que se usaron, con cuántos m² puso cada uno. El que más puso es
  // "la lámina principal" del trabajo.
  const porRollo = new Map<string, number>();
  for (const item of order.items) {
    if (!item.rollId) continue;
    porRollo.set(item.rollId, (porRollo.get(item.rollId) ?? 0) + Number(item.squareMetersUsed ?? 0));
  }
  // Sin rollos declarados no hay garantía que generar, y está bien: hay
  // trabajos que no llevan lámina (un pulido, sacar una película vieja).
  if (porRollo.size === 0) return resultado;

  const rollosOrdenados = [...porRollo.entries()].sort((a, b) => b[1] - a[1]);

  const nombreTaller = await nombreDelTaller(tx, order.contactId);
  const datosBase = {
    assetType: (order.asset?.type ?? "OTHER") as "VEHICLE" | "WINDOW" | "BUILDING" | "OTHER",
    assetDescription: describirAsset(order.asset),
    clientName: order.workshopClient.name,
    clientEmail: order.workshopClient.email,
    clientPhone: order.workshopClient.phone,
    clientDni: order.workshopClient.dni,
    installedAt: order.finishedAt ?? new Date(),
    installerName: nombreTaller,
    notes: `Orden de trabajo #${order.orderNumber}${order.notes ? ` — ${order.notes}` : ""}`,
  };

  for (const [rollId] of rollosOrdenados) {
    const roll = await tx.warrantyRoll.findFirst({
      // Se revalida la propiedad acá también: la línea se validó al crearse,
      // pero entre eso y ahora pudo pasar cualquier cosa, y esta función activa
      // garantías. Barato y evita depender de una validación de otro momento.
      where: { id: rollId, saleItem: { sale: { contactId: order.contactId } } },
      select: { id: true, fullRollCode: true },
    });
    if (!roll) {
      resultado.problemas.push({ fullRollCode: rollId, motivo: "El rollo ya no figura como tuyo" });
      continue;
    }

    const slot = await allocateInstallationTx(tx, roll.id);
    if (!slot) {
      resultado.problemas.push({
        fullRollCode: roll.fullRollCode,
        motivo: "El rollo no admite más instalaciones",
      });
      continue;
    }

    const { expiresAt } = await activateInstallationWarrantyTx(tx, slot.id, datosBase);
    resultado.generadas.push({
      installationId: slot.id,
      installationCode: slot.installationCode,
      activationToken: slot.activationToken,
      rollId: roll.id,
      fullRollCode: roll.fullRollCode,
      expiresAt,
    });
  }

  if (resultado.generadas.length > 0) {
    await tx.workOrder.update({
      where: { id: order.id },
      data: { warrantyInstallationId: resultado.generadas[0].installationId },
    });
  }

  return resultado;
}

/** Con qué nombre firma el taller la garantía que recibe el cliente final. */
async function nombreDelTaller(tx: Tx, contactId: string): Promise<string> {
  const [settings, contact] = await Promise.all([
    tx.workshopSettings.findUnique({ where: { contactId }, select: { workshopName: true } }),
    tx.contact.findUnique({
      where: { id: contactId },
      select: { company: true, firstName: true, lastName: true },
    }),
  ]);
  return (
    settings?.workshopName?.trim() ||
    contact?.company?.trim() ||
    `${contact?.firstName ?? ""} ${contact?.lastName ?? ""}`.trim() ||
    "Instalador autorizado"
  );
}

function describirAsset(
  asset: { identifier: string | null; brand: string | null; model: string | null; year: number | null } | null
): string | null {
  if (!asset) return null;
  const partes = [asset.brand, asset.model, asset.year ? String(asset.year) : null].filter(Boolean);
  const marca = partes.join(" ");
  return [marca, asset.identifier].filter(Boolean).join(" · ") || null;
}

// ─── El mail al cliente final ────────────────────────────────────────────────

export interface ResultadoMail {
  enviado: boolean;
  /** Por qué no se mandó, en palabras que el instalador pueda entender. */
  motivo?: string;
}

/**
 * Le manda al cliente final el link de su garantía. **Se llama después del
 * commit**, nunca dentro de la transacción.
 *
 * Nunca tira: devuelve si se mandó o no. Que el mail falle no puede tumbar la
 * respuesta de una orden que ya está terminada y guardada.
 *
 * Cuando falla, el trabajo NO se pierde: la garantía ya existe y el instalador
 * puede reenviar el mail desde la ficha de la instalación. Es un reintento a
 * mano y no una cola en segundo plano, a propósito — es un mail por trabajo, y
 * una cola que nadie mira es peor que un botón que alguien aprieta.
 */
export async function enviarMailDeGarantia(params: {
  destinatario: string | null;
  nombreCliente: string;
  nombreTaller: string;
  producto: string;
  installationCode: string;
  activationToken: string;
  expiresAt: Date;
}): Promise<ResultadoMail> {
  if (!params.destinatario) {
    return { enviado: false, motivo: "El cliente no tiene email cargado" };
  }
  if (!isSmtpConfigured()) {
    log.error("SMTP not configured — cannot send workshop warranty email");
    return { enviado: false, motivo: "El servidor de mail no está configurado" };
  }

  const link = `${portalBaseUrl()}/garantia/${encodeURIComponent(params.activationToken)}`;
  const vence = params.expiresAt.toLocaleDateString("es-AR");

  try {
    await transporter.sendMail({
      from: FROM(),
      to: params.destinatario,
      subject: `Tu garantía Kristall Film — ${params.installationCode}`,
      html: `
        <p>Hola ${escapeHtml(params.nombreCliente)},</p>
        <p><strong>${escapeHtml(params.nombreTaller)}</strong> terminó de instalar tu
        ${escapeHtml(params.producto)} y te dejó la garantía activada.</p>
        <p>Guardá este link — es el que vas a necesitar si alguna vez tenés un problema:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Código: <strong>${escapeHtml(params.installationCode)}</strong><br>
        Vence el ${escapeHtml(vence)}.</p>
        <p>— Equipo Kristall Film</p>
      `,
    });
    return { enviado: true };
  } catch (error: unknown) {
    // El detalle del error SMTP va al log, no a la respuesta. Es la lección de
    // F0-11: el `diagnostico` que se reenviaba al navegador traía el usuario y
    // el mensaje del servidor de mail.
    const e = error as { code?: string; message?: string };
    log.error(
      { err: error, code: e.code, to: params.destinatario, smtpHost: process.env.SMTP_HOST },
      "SMTP send failed for workshop warranty email"
    );
    return { enviado: false, motivo: "No pudimos enviar el mail en este momento" };
  }
}

/**
 * Avisa a los admins del CRM de lo que pasó al terminar una orden.
 *
 * Solo agregados y códigos, nunca la ficha del cliente final del instalador:
 * es el supuesto 1 de la sección 7 del plan (Kristall no ve la cartera del
 * taller). Un admin necesita saber que se activó una garantía y sobre qué
 * rollo, no quién es el dueño del auto.
 */
export async function avisarGarantiasGeneradas(
  resultado: ResultadoGarantia,
  orderNumber: number
): Promise<void> {
  if (resultado.generadas.length > 0) {
    const codigos = resultado.generadas.map((g) => g.installationCode).join(", ");
    await notifyAdmins({
      type: "WARRANTY_ACTIVATED",
      title: "Garantía activada desde un taller",
      message: `La orden #${orderNumber} de un instalador activó ${codigos}.`,
      link: "/warranty-claims",
    });
  }
  for (const p of resultado.problemas) {
    await notifyAdmins({
      type: "WARRANTY_SUBCODE_CREATED",
      title: "No se pudo generar una garantía",
      message: `Orden #${orderNumber}, rollo ${p.fullRollCode}: ${p.motivo}.`,
      link: "/warranty-claims",
    });
  }
}

/** Datos del mail para una instalación recién generada. */
export async function datosParaMail(orderId: string, installationId: string) {
  const [order, installation] = await Promise.all([
    prisma.workOrder.findUnique({
      where: { id: orderId },
      select: {
        contactId: true,
        workshopClient: { select: { name: true, email: true } },
      },
    }),
    prisma.warrantyInstallation.findUnique({
      where: { id: installationId },
      select: {
        installationCode: true,
        activationToken: true,
        expiresAt: true,
        installerName: true,
        roll: { select: { product: { select: { name: true } } } },
      },
    }),
  ]);
  if (!order || !installation || !installation.expiresAt) return null;

  return {
    destinatario: order.workshopClient.email,
    nombreCliente: order.workshopClient.name,
    nombreTaller: installation.installerName ?? "Tu instalador",
    producto: installation.roll.product.name,
    installationCode: installation.installationCode,
    activationToken: installation.activationToken,
    expiresAt: installation.expiresAt,
  };
}
