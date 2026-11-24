import { createLogger } from "@/lib/logger";
import { esDemo } from "@/lib/demo-context";
import { isCloudApiConfigured, sendTemplateMessage, WhatsAppApiError } from "@/lib/whatsapp/client";
import { cleanParam, recordOutbound } from "@/lib/whatsapp/outbound";
import { normalizeWhatsappNumber } from "@/lib/whatsapp/phone";
import { primaryLine } from "@/lib/whatsapp/lines";
import { PERU_OUTREACH_TEMPLATE } from "@/lib/whatsapp/template-rules";
import type { WhatsAppSendResponse, WhatsAppTemplateComponent } from "@/types/whatsapp";

const log = createLogger("lib/whatsapp/notices");

/**
 * Avisos automáticos por WhatsApp, siempre con plantilla.
 *
 * Los avisos no tienen una conversación abierta con el destinatario (el
 * instalador no nos escribió, el cliente tampoco), así que la Cloud API solo
 * deja mandarlos con una plantilla aprobada por Meta. Por eso cada aviso es una
 * función con sus variables fijas y no un "mandá este texto".
 *
 * El texto de cada plantilla vive en Meta, no acá: lo que sigue es el contrato
 * de variables ({{1}}, {{2}}, ...). Si se cambia el orden o la cantidad en una
 * plantilla, hay que cambiarlo acá a la vez. El texto aprobado está en
 * WHATSAPP-CLOUD-API.md.
 *
 * **Nada de acá tira.** Un aviso que no sale no puede deshacer el pedido que ya
 * quedó guardado, igual que en `booking-notify.ts`. Devuelven si salió.
 */

const LANGUAGE = "es_AR";

const TEMPLATE_BOOKING = process.env.WHATSAPP_TEMPLATE_BOOKING || "kristall_pedido_turno";
/**
 * La misma que `TEMPLATE_BOOKING` con dos botones de respuesta rápida:
 * Confirmar (índice 0) y Rechazar (índice 1). Ver `booking-actions.ts`.
 */
const TEMPLATE_BOOKING_BUTTONS =
  process.env.WHATSAPP_TEMPLATE_BOOKING_BUTTONS || "kristall_pedido_turno_botones";
const TEMPLATE_DATA_REQUEST = process.env.WHATSAPP_TEMPLATE_DATA_REQUEST || "kristall_pedir_datos";
/** Al cliente: el taller confirmó su turno. Botón URL "Cómo llegar" (Google Maps). */
const TEMPLATE_BOOKING_CONFIRMED =
  process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMED || "kristall_turno_confirmado";
/** Al cliente: el taller no pudo tomar su turno. Botón URL "Pedir otro turno". */
const TEMPLATE_BOOKING_REJECTED =
  process.env.WHATSAPP_TEMPLATE_BOOKING_REJECTED || "kristall_turno_rechazado";

// ─── Avisos ──────────────────────────────────────────────────────────────────

/**
 * Al instalador: le entró un pedido de turno.
 *
 * Variables: {{1}} servicio · {{2}} cuándo · {{3}} cliente y teléfono ·
 * {{4}} detalle (patente o dirección) · {{5}} link a la bandeja.
 *
 * Con `buttonPayloads` (Confirmar, Rechazar) sale la versión con botones. Si
 * esa no sale —típicamente porque Meta todavía no la aprobó—, se manda la de
 * siempre: el aviso llega igual y el pedido se responde desde el panel. Así el
 * código se puede desplegar antes de que la plantilla nueva esté aprobada.
 */
export async function sendBookingNotice(args: {
  to: string;
  contactId?: string | null;
  serviceName: string;
  cuando: string;
  clientLine: string;
  detalle: string;
  linkBandeja: string;
  buttonPayloads?: [confirmar: string, rechazar: string];
}): Promise<boolean> {
  const variables = [args.serviceName, args.cuando, args.clientLine, args.detalle || "Sin detalle", args.linkBandeja];
  if (args.buttonPayloads) {
    const sent = await sendTemplateNotice({
      to: args.to,
      templateName: TEMPLATE_BOOKING_BUTTONS,
      variables,
      quickReplyPayloads: args.buttonPayloads,
      contactId: args.contactId,
    });
    if (sent) return true;
    log.warn({ template: TEMPLATE_BOOKING_BUTTONS }, "La plantilla con botones no salió; va la de siempre");
  }
  return sendTemplateNotice({
    to: args.to,
    templateName: TEMPLATE_BOOKING,
    variables,
    contactId: args.contactId,
  });
}

/**
 * Al cliente final: el taller confirmó su turno.
 *
 * Variables: {{1}} nombre de pila · {{2}} taller · {{3}} servicio · {{4}} cuándo ·
 * {{5}} dirección del taller. Botón 0 (URL): lo que va detrás de
 * `https://www.google.com/maps/dir/?api=1&destination=` — "lat,lng" o la
 * dirección, ya codificada para URL.
 */
export function sendBookingConfirmedToClient(args: {
  to: string;
  nombre: string;
  taller: string;
  serviceName: string;
  cuando: string;
  direccion: string;
  mapsDestination: string;
}): Promise<boolean> {
  return sendTemplateNotice({
    to: args.to,
    templateName: TEMPLATE_BOOKING_CONFIRMED,
    variables: [args.nombre, args.taller, args.serviceName, args.cuando, args.direccion],
    urlButtonSuffix: args.mapsDestination,
  });
}

/**
 * Al cliente final: el taller no pudo tomar su turno.
 *
 * Variables: {{1}} nombre de pila · {{2}} taller · {{3}} servicio · {{4}} cuándo ·
 * {{5}} teléfono del taller. Botón 0 (URL): el handle de la página del taller,
 * detrás de `https://polariz.ar/`, para pedir otro horario.
 */
export function sendBookingRejectedToClient(args: {
  to: string;
  nombre: string;
  taller: string;
  serviceName: string;
  cuando: string;
  telefonoTaller: string;
  handle: string;
}): Promise<boolean> {
  return sendTemplateNotice({
    to: args.to,
    templateName: TEMPLATE_BOOKING_REJECTED,
    variables: [args.nombre, args.taller, args.serviceName, args.cuando, args.telefonoTaller],
    urlButtonSuffix: args.handle,
  });
}

/**
 * Al cliente sin email: el link personal para que lo cargue.
 *
 * Variables: {{1}} nombre de pila · {{2}} link personal.
 *
 * El link es una llave y el historial lo lee cualquier SUPERADMIN, así que se
 * guarda tapado en `content` (ver `redact`).
 */
export function sendDataRequestNotice(args: {
  to: string;
  nombre: string;
  link: string;
  contactId?: string | null;
  sentById?: string | null;
}): Promise<boolean> {
  return sendTemplateNotice({
    to: args.to,
    templateName: TEMPLATE_DATA_REQUEST,
    variables: [args.nombre, args.link],
    redact: [1],
    contactId: args.contactId,
    sentById: args.sentById,
  });
}

// ─── Envío ───────────────────────────────────────────────────────────────────

async function sendTemplateNotice(args: {
  to: string;
  templateName: string;
  variables: string[];
  /** Índices (0-based) de variables que no se guardan en el registro. */
  redact?: number[];
  /**
   * El payload de cada botón de respuesta rápida, en el orden de la plantilla.
   * Es lo que vuelve por el webhook cuando lo tocan. No se guarda en el
   * registro: es una llave.
   */
  quickReplyPayloads?: string[];
  /** Lo que completa el `{{1}}` del final del botón URL (índice 0) de la plantilla. */
  urlButtonSuffix?: string;
  contactId?: string | null;
  sentById?: string | null;
}): Promise<boolean> {
  // En una sesión de demostración no sale nada: el "cliente" o el "instalador"
  // es un número que el prospecto inventó, que puede ser el de cualquiera. Ni
  // siquiera se deja la fila del intento.
  if (esDemo()) {
    log.info({ template: args.templateName }, "Sesion de demostracion: el WhatsApp NO se envia");
    return false;
  }

  if (!isCloudApiConfigured()) {
    log.error({ template: args.templateName }, "WhatsApp Cloud API no configurada — no se manda el aviso");
    return false;
  }

  const to = normalizeWhatsappNumber(args.to);
  if (!to) return false;

  const components: WhatsAppTemplateComponent[] = [
    { type: "body", parameters: args.variables.map((v) => ({ type: "text", text: cleanParam(v) })) },
    ...(args.quickReplyPayloads ?? []).map(
      (payload, i): WhatsAppTemplateComponent => ({
        type: "button",
        sub_type: "quick_reply",
        index: String(i),
        parameters: [{ type: "payload", payload }],
      })
    ),
    ...(args.urlButtonSuffix
      ? [
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: args.urlButtonSuffix }],
          } as WhatsAppTemplateComponent,
        ]
      : []),
  ];

  let response: WhatsAppSendResponse;
  try {
    // Siempre por la línea principal (WPP Carlos): los toques en los botones
    // vuelven a la línea que mandó el mensaje, y el webhook solo los atiende ahí.
    response = await sendTemplateMessage(to, args.templateName, LANGUAGE, components, primaryLine().phoneNumberId || undefined);
  } catch (err) {
    const detail = err instanceof WhatsAppApiError ? { code: err.code, status: err.httpStatus } : {};
    log.error(
      { err: err instanceof Error ? err.message : err, template: args.templateName, to, ...detail },
      "No se pudo enviar el WhatsApp"
    );
    return false;
  }

  const wamid = response.messages?.[0]?.id;
  if (wamid) {
    await recordOutbound({
      wamid,
      to,
      type: "template",
      content: {
        type: "template",
        template: {
          name: args.templateName,
          language: { code: LANGUAGE },
          components: [
            {
              type: "body",
              parameters: args.variables.map((v, i) => ({
                type: "text",
                text: args.redact?.includes(i) ? "[tapado]" : cleanParam(v),
              })),
            },
          ],
        },
      },
      templateName: args.templateName,
      response,
      contactId: args.contactId,
      sentById: args.sentById,
    });
  }
  return true;
}

/**
 * Las plantillas que el CRM manda solo (avisos de turnos, pedir datos, invitación
 * a distribuidores, campaña de Perú). Borrarlas desde la gestión de plantillas
 * dejaría esos envíos fallando en silencio, así que no se ofrecen para borrar.
 */
export function systemTemplateNames(): string[] {
  return [
    TEMPLATE_BOOKING,
    TEMPLATE_BOOKING_BUTTONS,
    TEMPLATE_DATA_REQUEST,
    TEMPLATE_BOOKING_CONFIRMED,
    TEMPLATE_BOOKING_REJECTED,
    process.env.WHATSAPP_TEMPLATE_DISTRIBUTOR || "kristall_propuesta_distribuidor",
    PERU_OUTREACH_TEMPLATE,
  ];
}
