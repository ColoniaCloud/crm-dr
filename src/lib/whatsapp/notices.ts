import { createLogger } from "@/lib/logger";
import { esDemo } from "@/lib/demo-context";
import { isCloudApiConfigured, sendTemplateMessage, WhatsAppApiError } from "@/lib/whatsapp/client";
import { cleanParam, recordOutbound } from "@/lib/whatsapp/outbound";
import { normalizeWhatsappNumber } from "@/lib/whatsapp/phone";
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
const TEMPLATE_DATA_REQUEST = process.env.WHATSAPP_TEMPLATE_DATA_REQUEST || "kristall_pedir_datos";

// ─── Avisos ──────────────────────────────────────────────────────────────────

/**
 * Al instalador: le entró un pedido de turno.
 *
 * Variables: {{1}} servicio · {{2}} cuándo · {{3}} cliente y teléfono ·
 * {{4}} detalle (patente o dirección) · {{5}} link a la bandeja.
 */
export function sendBookingNotice(args: {
  to: string;
  contactId?: string | null;
  serviceName: string;
  cuando: string;
  clientLine: string;
  detalle: string;
  linkBandeja: string;
}): Promise<boolean> {
  return sendTemplateNotice({
    to: args.to,
    templateName: TEMPLATE_BOOKING,
    variables: [args.serviceName, args.cuando, args.clientLine, args.detalle || "Sin detalle", args.linkBandeja],
    contactId: args.contactId,
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
  ];

  let response: WhatsAppSendResponse;
  try {
    response = await sendTemplateMessage(to, args.templateName, LANGUAGE, components);
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
