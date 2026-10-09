import { prisma } from "@/lib/prisma";
import { issuePortalToken, portalBaseUrl } from "@/lib/portal-tokens";
import { normalizeWhatsappNumber } from "@/lib/whatsapp";
import { WHERE_COMPRADOR } from "@/lib/contact-types";

/**
 * Pedirle el email a un Cliente que no lo tiene, por WhatsApp.
 *
 * ─── El flujo ──────────────────────────────────────────────────────────────
 *
 *   1. Desde /whatsapp (pestaña "Pedir datos") un SUPERADMIN elige Clientes sin
 *      email y les manda un link personal: `/cliente/mis-datos/<token>` en
 *      kristall-web. Token DATA_UPDATE, 7 días.
 *   2. El Cliente abre el link, corrige sus datos básicos y escribe su email.
 *      Los datos básicos se guardan en ese momento. **El email no**: se le
 *      manda un mail con otro link (EMAIL_CONFIRM, 24 h) y queda en espera.
 *   3. Cuando confirma desde su casilla, el email pasa a la ficha y el link de
 *      WhatsApp se da por usado.
 *
 * ─── Por qué el email espera la confirmación ───────────────────────────────
 *
 * Porque el email es la llave del Cliente: con él se activa el portal, se
 * recupera la contraseña y llegan las garantías. Un WhatsApp se reenvía fácil,
 * y un email mal tipeado se guarda igual de fácil. Si el email entrara directo,
 * cualquiera de los dos le daría a otra persona la cuenta del Cliente.
 *
 * Los datos básicos sí entran directo: el peor caso es un nombre mal escrito,
 * y quedan anotados en el aviso a los admins con el valor anterior.
 *
 * ─── Solo Clientes ─────────────────────────────────────────────────────────
 *
 * `type: "CLIENT"` a secas, no `WHERE_COMPRADOR`: es lo que se pidió, y un
 * revendedor tiene otra relación comercial. Ampliarlo es tocar `TIPO_DESTINO`.
 */

export const TIPO_DESTINO = "CLIENT" as const;

/** Los campos que el Cliente puede corregir. La lista vive acá para que el GET y el POST no se separen. */
export const CAMPOS_BASICOS = ["firstName", "lastName", "company", "phone", "address", "city", "state"] as const;
export type CampoBasico = (typeof CAMPOS_BASICOS)[number];

export const NOMBRE_CAMPO: Record<CampoBasico, string> = {
  firstName: "Nombre",
  lastName: "Apellido",
  company: "Empresa",
  phone: "Teléfono",
  address: "Dirección",
  city: "Ciudad",
  state: "Provincia",
};

export const MENSAJE_POR_DEFECTO =
  "¡Hola {{nombre}}! Te escribimos de Kristall Film. " +
  "Para mandarte por mail tus comprobantes y garantías nos falta tu email. " +
  "Podés cargarlo, y revisar tus datos, acá:\n\n{{link}}\n\n" +
  "El link es personal y vale 7 días.";

const sinEmail = { OR: [{ email: null }, { email: "" }] };

/** El número al que se le escribe: el de WhatsApp, o el teléfono si no hay. "" si ninguno sirve. */
export function numeroDestino(c: { whatsapp: string | null; phone: string | null }): string {
  const n = normalizeWhatsappNumber(c.whatsapp || c.phone || "");
  return n.length >= 10 ? n : "";
}

export type EstadoPedido = "SIN_ENVIAR" | "ENVIADO" | "VENCIDO" | "ESPERA_CONFIRMACION";

/**
 * Los Clientes sin email, con el estado de su pedido. El estado sale de los
 * tokens, no de una columna: un token vigente es un link que anda.
 */
export async function clientesSinEmail() {
  const contactos = await prisma.contact.findMany({
    where: { type: TIPO_DESTINO, ...sinEmail },
    select: {
      id: true, firstName: true, lastName: true, company: true, whatsapp: true, phone: true,
      portalTokens: {
        where: { purpose: { in: ["DATA_UPDATE", "EMAIL_CONFIRM"] } },
        orderBy: { createdAt: "desc" },
        select: { purpose: true, createdAt: true, expiresAt: true, usedAt: true },
      },
    },
    orderBy: [{ company: "asc" }, { firstName: "asc" }],
  });

  const ahora = new Date();
  return contactos.map((c) => {
    const ultimoLink = c.portalTokens.find((t) => t.purpose === "DATA_UPDATE");
    const confirmacion = c.portalTokens.find(
      (t) => t.purpose === "EMAIL_CONFIRM" && !t.usedAt && t.expiresAt > ahora
    );
    let estado: EstadoPedido = "SIN_ENVIAR";
    if (confirmacion) estado = "ESPERA_CONFIRMACION";
    else if (ultimoLink) estado = !ultimoLink.usedAt && ultimoLink.expiresAt > ahora ? "ENVIADO" : "VENCIDO";

    return {
      id: c.id,
      nombre: `${c.firstName} ${c.lastName}`.trim(),
      company: c.company,
      numero: numeroDestino(c),
      estado,
      ultimoEnvio: ultimoLink?.createdAt.toISOString() ?? null,
    };
  });
}

/**
 * Emite el link personal. Invalida el anterior (issuePortalToken lo hace), así
 * que reenviar deja un solo link vivo por Cliente.
 */
export async function emitirLinkDatos(contactId: string, numero: string) {
  const { token, expiresAt } = await issuePortalToken({
    contactId,
    purpose: "DATA_UPDATE",
    sentToEmail: `whatsapp:${numero}`,
  });
  return { link: `${portalBaseUrl()}/cliente/mis-datos/${token}`, expiresAt };
}

/** Reemplaza {{nombre}} y {{link}}. El nombre es el de pila: es un WhatsApp, no una carta. */
export function armarMensaje(plantilla: string, nombre: string, link: string): string {
  return plantilla.replaceAll("{{nombre}}", nombre).replaceAll("{{link}}", link);
}

/**
 * ¿Hay otro comprador con este email? Es lo mismo que mira el alta del portal
 * (request-activation): si dos fichas comparten email, ninguna puede activar.
 * Se compara sin distinguir mayúsculas porque MySQL tampoco lo hace.
 */
export async function emailEnOtraFicha(email: string, contactId: string): Promise<boolean> {
  const otro = await prisma.contact.findFirst({
    where: { ...WHERE_COMPRADOR, email, NOT: { id: contactId } },
    select: { id: true },
  });
  return Boolean(otro);
}
