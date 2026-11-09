import { randomBytes } from "node:crypto";
import type { DistributorInvite, InviteChannelStatus } from "@prisma/client";
import { esDemo } from "@/lib/demo-context";
import { createLogger } from "@/lib/logger";
import { FROM, isSmtpConfigured, transporter } from "@/lib/mailer";
import { renderInvitacionDistribuidor } from "@/lib/mail-distribuidor";
import { portalBaseUrl } from "@/lib/portal-tokens";
import { prisma } from "@/lib/prisma";
import { isCloudApiConfigured, sendTemplateMessage, WhatsAppApiError } from "@/lib/whatsapp/client";
import { cleanParam, recordOutbound } from "@/lib/whatsapp/outbound";
import type { WhatsAppSendResponse, WhatsAppTemplateComponent } from "@/types/whatsapp";

const log = createLogger("lib/distributor-invite");

/**
 * Invitaciones personalizadas a la página de distribuidores de Perú.
 *
 * ─── El flujo ──────────────────────────────────────────────────────────────
 *
 *   1. Un SUPERADMIN carga nombre, negocio, teléfono y mail (/c-peru, pestaña
 *      «Invitaciones»). Se crea la fila con un `token` aleatorio.
 *   2. El CRM manda el link `kristallfilm.com/distribuidores-peru/<token>` por
 *      WhatsApp (plantilla `kristall_propuesta_distribuidor`, con botón de URL
 *      dinámica) y por mail, a la vez. Cada canal guarda su resultado por
 *      separado: que falle uno no tumba al otro ni a la invitación.
 *   3. kristall-web llama a `GET /api/portal/v1/distributor-invite?token=…` (con
 *      la key del portal), recibe solo nombre y negocio —nunca teléfono ni
 *      mail— y arma el encabezado «Preparada para …». Esa lectura cuenta como
 *      «abierta».
 *
 * ─── Por qué un token y no el id ───────────────────────────────────────────
 *
 * Lo que queda a la vista en una URL que se comparte no debe ser un id interno
 * (ver F0-23). El token se guarda en claro y no hasheado, a diferencia de los
 * de `portal-tokens.ts`: no abre nada sensible (es una página de presentación)
 * y hay que poder reenviarlo.
 *
 * **Nada de acá tira por un canal que falla**: devuelve el estado de cada uno.
 */

/** La plantilla de WhatsApp (texto aprobado en Meta; acá solo el contrato de variables). */
const TEMPLATE = process.env.WHATSAPP_TEMPLATE_DISTRIBUTOR || "kristall_propuesta_distribuidor";
/** Con el idioma con que se creó la plantilla en Meta. */
const LANGUAGE = "es_PE";

export function generateInviteToken(): string {
  return randomBytes(16).toString("base64url"); // 22 caracteres
}

export function inviteUrl(token: string): string {
  return `${portalBaseUrl()}/distribuidores-peru/${token}`;
}

/** Lo que el CRM muestra de cada invitación (con el link armado). */
export function serializeInvite(i: DistributorInvite & { createdBy?: { name: string | null } | null }) {
  return {
    id: i.id,
    name: i.name,
    business: i.business,
    phone: i.phone,
    email: i.email,
    url: inviteUrl(i.token),
    whatsappStatus: i.whatsappStatus,
    whatsappSentAt: i.whatsappSentAt,
    whatsappError: i.whatsappError,
    emailStatus: i.emailStatus,
    emailSentAt: i.emailSentAt,
    emailError: i.emailError,
    firstOpenedAt: i.firstOpenedAt,
    lastOpenedAt: i.lastOpenedAt,
    openCount: i.openCount,
    revokedAt: i.revokedAt,
    createdAt: i.createdAt,
    createdByName: i.createdBy?.name ?? null,
  };
}

type Canal = { status: InviteChannelStatus; error: string | null };

// ─── WhatsApp ────────────────────────────────────────────────────────────────

async function enviarWhatsApp(i: DistributorInvite, sentById?: string | null): Promise<Canal> {
  if (esDemo()) return { status: "SKIPPED", error: "Sesión de demostración" };
  if (!isCloudApiConfigured()) return { status: "SKIPPED", error: "WhatsApp no está configurado en el servidor" };

  const nombreDePila = i.name.trim().split(/\s+/)[0] || i.name;
  const components: WhatsAppTemplateComponent[] = [
    {
      type: "body",
      parameters: [
        { type: "text", text: cleanParam(nombreDePila) },
        { type: "text", text: cleanParam(i.business) },
      ],
    },
    // Botón «Ver propuesta»: Meta guarda la base de la URL y acá va solo el token.
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: i.token }] },
  ];

  let response: WhatsAppSendResponse;
  try {
    response = await sendTemplateMessage(i.phone, TEMPLATE, LANGUAGE, components);
  } catch (err) {
    const detalle = err instanceof WhatsAppApiError ? ` (código ${err.code ?? err.httpStatus})` : "";
    const mensaje = `${err instanceof Error ? err.message : "Error desconocido"}${detalle}`;
    log.error({ err: mensaje, invite: i.id }, "No se pudo mandar el WhatsApp de la invitación");
    return { status: "FAILED", error: mensaje.slice(0, 500) };
  }

  const wamid = response.messages?.[0]?.id;
  if (wamid) {
    await recordOutbound({
      wamid,
      to: i.phone,
      type: "template",
      content: {
        type: "template",
        template: { name: TEMPLATE, language: { code: LANGUAGE }, components: JSON.parse(JSON.stringify(components)) },
      },
      templateName: TEMPLATE,
      response,
      sentById,
    });
  }
  return { status: "SENT", error: null };
}

// ─── Mail ────────────────────────────────────────────────────────────────────

async function enviarMail(i: DistributorInvite): Promise<Canal> {
  if (esDemo()) return { status: "SKIPPED", error: "Sesión de demostración" };
  if (!isSmtpConfigured()) return { status: "SKIPPED", error: "El envío de mails no está configurado (falta SMTP)" };

  const { subject, html } = renderInvitacionDistribuidor({
    nombre: i.name,
    negocio: i.business,
    url: inviteUrl(i.token),
  });
  try {
    await transporter.sendMail({ from: FROM("Carlos Arrúa · Kristall"), to: i.email, subject, html });
    return { status: "SENT", error: null };
  } catch (err) {
    const mensaje = err instanceof Error && err.message ? err.message : "Error desconocido";
    log.error({ err: mensaje, invite: i.id }, "No se pudo mandar el mail de la invitación");
    return { status: "FAILED", error: mensaje.slice(0, 500) };
  }
}

// ─── Operaciones ─────────────────────────────────────────────────────────────

export type CanalInvitacion = "whatsapp" | "email";

/**
 * Manda la invitación por los canales pedidos y deja el resultado de cada uno
 * en la fila. Sirve tanto para el primer envío (los dos) como para reenviar.
 */
export async function sendInvite(
  invite: DistributorInvite,
  canales: CanalInvitacion[] = ["whatsapp", "email"],
  sentById?: string | null
): Promise<DistributorInvite> {
  const [wa, mail] = await Promise.all([
    canales.includes("whatsapp") ? enviarWhatsApp(invite, sentById) : null,
    canales.includes("email") ? enviarMail(invite) : null,
  ]);
  const now = new Date();
  return prisma.distributorInvite.update({
    where: { id: invite.id },
    data: {
      ...(wa && {
        whatsappStatus: wa.status,
        whatsappError: wa.error,
        whatsappSentAt: wa.status === "SENT" ? now : invite.whatsappSentAt,
      }),
      ...(mail && {
        emailStatus: mail.status,
        emailError: mail.error,
        emailSentAt: mail.status === "SENT" ? now : invite.emailSentAt,
      }),
    },
  });
}

export async function createInvite(data: {
  name: string;
  business: string;
  phone: string;
  email: string;
  createdById: string;
}): Promise<DistributorInvite> {
  const invite = await prisma.distributorInvite.create({
    data: { ...data, token: generateInviteToken() },
  });
  return sendInvite(invite, ["whatsapp", "email"], data.createdById);
}

/**
 * Lo que lee kristall-web con el token. Cuenta la visita. `null` si el token no
 * existe; `revoked: true` si el link se desactivó.
 *
 * Solo devuelve nombre y negocio: el teléfono y el mail son del CRM, y el link
 * puede haberse reenviado a otra persona.
 */
export async function readInviteByToken(
  token: string
): Promise<{ name: string; business: string; revoked: false } | { revoked: true } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const invite = await prisma.distributorInvite.findUnique({ where: { token } });
  if (!invite) return null;
  if (invite.revokedAt) return { revoked: true };

  const now = new Date();
  await prisma.distributorInvite.update({
    where: { id: invite.id },
    data: {
      openCount: { increment: 1 },
      lastOpenedAt: now,
      ...(invite.firstOpenedAt ? {} : { firstOpenedAt: now }),
    },
  });
  return { name: invite.name, business: invite.business, revoked: false };
}
