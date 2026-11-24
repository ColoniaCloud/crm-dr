import { contactWhatsappRaw, normalizeWhatsappNumber } from "@/lib/whatsapp/phone";
import type { WhatsAppInboundMessage } from "@/types/whatsapp";

/**
 * Los botones del WhatsApp de pedido de turno: qué lleva cada uno y cómo se lee
 * lo que vuelve. Código puro (sin base): lo usan el aviso, el webhook y las
 * pruebas.
 *
 * El recorrido:
 *   1. Al instalador le llega la plantilla `kristall_pedido_turno_botones` con
 *      dos respuestas rápidas: Confirmar y Rechazar.
 *   2. Confirmar → el turno queda agendado con la fecha que pidió el cliente.
 *   3. Rechazar → todavía no se rechaza: se le pregunta "¿Seguro?" con dos
 *      botones (Sí, rechazar / No, dejarlo), porque rechazar no tiene vuelta y le
 *      llega al cliente.
 *
 * Cada botón lleva `turno:<acción>:<actionToken>`. La llave es aleatoria (ver
 * `WorkshopBooking.actionToken`) y no el id del pedido: lo que viaja por Meta no
 * tiene que servir para adivinar otros pedidos.
 */

export type BookingButtonAction =
  /** Botón de la plantilla: agenda el turno. */
  | "confirmar"
  /** Botón de la plantilla: pide confirmación antes de rechazar. */
  | "rechazar"
  /** Respuesta a "¿Seguro?": ahora sí, rechaza. */
  | "rechazar-si"
  /** Respuesta a "¿Seguro?": no hace nada, el pedido sigue pendiente. */
  | "mantener";

const PREFIX = "turno";
const ACTIONS: readonly BookingButtonAction[] = ["confirmar", "rechazar", "rechazar-si", "mantener"];
const TOKEN = /^[a-f0-9]{16,128}$/;

export function bookingButtonPayload(action: BookingButtonAction, token: string): string {
  return `${PREFIX}:${action}:${token}`;
}

/** Los payloads de la plantilla, en su orden: índice 0 Confirmar, índice 1 Rechazar. */
export function bookingButtonPayloads(token: string): [string, string] {
  return [bookingButtonPayload("confirmar", token), bookingButtonPayload("rechazar", token)];
}

/**
 * Lee un mensaje entrante: si es el toque de uno de estos botones devuelve la
 * acción y la llave; si no (texto, otro botón, payload mal formado), `null`.
 *
 * Los botones de una plantilla llegan como `type: "button"` con el `payload`;
 * los de un mensaje interactivo (el "¿Seguro?") como `interactive.button_reply`
 * con el `id`.
 */
export function parseBookingButton(
  message: WhatsAppInboundMessage
): { action: BookingButtonAction; token: string } | null {
  // Se lee a mano y no por el tipo: el mensaje viene de afuera y puede no
  // tener la forma que promete.
  const m = message as unknown as {
    type?: string;
    button?: { payload?: unknown };
    interactive?: { type?: string; button_reply?: { id?: unknown } };
  };
  let raw: unknown;
  if (m.type === "button") raw = m.button?.payload;
  else if (m.type === "interactive" && m.interactive?.type === "button_reply") raw = m.interactive.button_reply?.id;
  if (typeof raw !== "string") return null;
  const [prefix, action, token, ...rest] = raw.split(":");
  if (prefix !== PREFIX || rest.length > 0) return null;
  if (!ACTIONS.includes(action as BookingButtonAction)) return null;
  if (!token || !TOKEN.test(token)) return null;
  return { action: action as BookingButtonAction, token };
}

/**
 * ¿Es el mismo teléfono? Compara como los guarda WhatsApp, con la rareza
 * argentina: el `from` de un móvil llega como `549…` y la ficha puede tenerlo
 * como `54…`, `11…` o `011 15…`. Es la misma persona.
 */
export function sameWhatsappNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonical(a);
  return ca !== "" && ca === canonical(b);
}

/**
 * A qué número va el aviso de turno del instalador: el campo WhatsApp de la
 * ficha y, si está vacío, el Teléfono. Muchos instaladores tienen el número
 * cargado solo en uno de los dos; leer solo Teléfono dejaba sin aviso, y sin
 * rastro, a los que lo tienen en WhatsApp.
 */
export function installerWhatsapp(contact: { whatsapp?: string | null; phone?: string | null }): string | null {
  return contactWhatsappRaw(contact);
}

/**
 * ¿El que toca el botón es el instalador? Vale cualquiera de los dos números de
 * su ficha: el aviso pudo salir a uno u otro, y los dos son suyos.
 */
export function isInstallerNumber(
  from: string | null | undefined,
  contact: { whatsapp?: string | null; phone?: string | null }
): boolean {
  return sameWhatsappNumber(from, contact.whatsapp) || sameWhatsappNumber(from, contact.phone);
}

function canonical(raw: string | null | undefined): string {
  let d = normalizeWhatsappNumber(raw ?? "");
  if (d.startsWith("549")) d = `54${d.slice(3)}`;
  // El "15" de los celulares viejos, después del código de área: 54 11 15 xxxx xxxx.
  const m = /^54(\d{2,4})15(\d{6,8})$/.exec(d);
  if (m && m[1].length + m[2].length === 10) d = `54${m[1]}${m[2]}`;
  return d;
}
