import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { esDemo } from "@/lib/demo-context";
import { isCloudApiConfigured, sendTemplateMessage, WhatsAppApiError } from "@/lib/whatsapp/client";
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
      templateName: args.templateName,
      components: [
        {
          type: "body",
          parameters: args.variables.map((v, i) => ({
            type: "text" as const,
            text: args.redact?.includes(i) ? "[tapado]" : cleanParam(v),
          })),
        },
      ],
      response,
      contactId: args.contactId,
      sentById: args.sentById,
    });
  }
  return true;
}

/**
 * Deja la fila del saliente para que los estados que llegan por webhook (sent,
 * delivered, read, failed) tengan a quién actualizar.
 *
 * Puede pasar que el estado llegue antes que esta fila (el webhook y la
 * respuesta de la API corren en paralelo): en ese caso el procesador del webhook
 * ya dejó una fila mínima de tipo "unknown" y acá se completa en vez de chocar.
 */
async function recordOutbound(args: {
  wamid: string;
  to: string;
  templateName: string;
  components: WhatsAppTemplateComponent[];
  response: WhatsAppSendResponse;
  contactId?: string | null;
  sentById?: string | null;
}): Promise<void> {
  const content = {
    type: "template",
    template: { name: args.templateName, language: { code: LANGUAGE }, components: args.components },
  } as unknown as Prisma.InputJsonValue;
  const rawPayload = args.response as unknown as Prisma.InputJsonValue;

  try {
    await prisma.whatsAppCloudMessage.create({
      data: {
        wamid: args.wamid,
        direction: "outbound",
        from: (process.env.WHATSAPP_BUSINESS_NUMBER || process.env.WHATSAPP_PHONE_NUMBER_ID || "").replace(/\D/g, ""),
        to: args.to,
        type: "template",
        content,
        timestamp: new Date(),
        status: "sent",
        statusUpdatedAt: new Date(),
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
        wabaId: process.env.WHATSAPP_WABA_ID ?? "",
        contactId: args.contactId ?? null,
        sentById: args.sentById ?? null,
        templateName: args.templateName,
        rawPayload,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Ya estaba la fila mínima del webhook: se le pone el contenido.
      await prisma.whatsAppCloudMessage
        .updateMany({
          where: { wamid: args.wamid, type: "unknown" },
          data: {
            type: "template",
            content,
            contactId: args.contactId ?? null,
            sentById: args.sentById ?? null,
            templateName: args.templateName,
            rawPayload,
          },
        })
        .catch((e) => log.error({ err: e }, "No se pudo completar el registro del WhatsApp"));
      return;
    }
    // El mensaje ya salió; que no quede registrado no es motivo para fallar.
    log.error({ err }, "No se pudo registrar el WhatsApp enviado");
  }
}

/**
 * Meta rechaza las variables con saltos de línea, tabulaciones o más de 4
 * espacios seguidos, y las vacías. Se limpian acá para que un dato sucio (una
 * dirección con un enter) no tumbe el aviso entero.
 */
function cleanParam(value: string): string {
  const clean = (value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {5,}/g, "    ")
    .trim()
    .slice(0, 1000);
  return clean || "-";
}
