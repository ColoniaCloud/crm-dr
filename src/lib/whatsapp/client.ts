import { createLogger } from "@/lib/logger";
import type {
  WhatsAppMediaInfo,
  WhatsAppSendResponse,
  WhatsAppTemplateComponent,
} from "@/types/whatsapp";

const log = createLogger("lib/whatsapp/client");

/**
 * Cliente de la WhatsApp Business Cloud API (Graph API de Meta).
 *
 * Es una capa fina y sin estado: arma el request, lo manda y tira
 * `WhatsAppApiError` si Meta rechaza. No persiste nada ni decide qué mandar;
 * eso lo hace `notices.ts`, que es lo que usa el resto del CRM.
 *
 * Variables de entorno: ver WHATSAPP-CLOUD-API.md.
 *   WHATSAPP_ACCESS_TOKEN      token permanente de System User
 *   WHATSAPP_PHONE_NUMBER_ID   id del número (no el número en sí)
 *   META_GRAPH_API_VERSION     opcional, por defecto v22.0
 *
 * El token nunca se loguea ni viaja en un mensaje de error.
 */

const DEFAULT_GRAPH_VERSION = "v22.0";
const SEND_TIMEOUT_MS = 10_000;
const MEDIA_TIMEOUT_MS = 30_000;

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    /** Código de error de Meta (ej. 131047 = fuera de la ventana de 24 h). */
    readonly code?: number,
    readonly fbtraceId?: string
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

export function isCloudApiConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

function config() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new WhatsAppApiError("WhatsApp Cloud API no está configurada", 503);
  }
  const version = process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION;
  return { token, phoneNumberId, base: `https://graph.facebook.com/${version}` };
}

type GraphErrorBody = {
  error?: { message?: string; code?: number; error_data?: { details?: string }; fbtrace_id?: string };
};

async function graphFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const { token } = config();
  try {
    return await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Red caída o timeout: se normaliza al mismo tipo para que quien llame
    // tenga un solo `catch`.
    const reason = err instanceof Error ? err.message : "error de red";
    throw new WhatsAppApiError(`No se pudo conectar con la Graph API: ${reason}`, 0);
  }
}

async function failFrom(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as GraphErrorBody;
  const e = body.error;
  const detail = e?.error_data?.details;
  const message = [e?.message, detail].filter(Boolean).join(" — ") || `HTTP ${res.status}`;
  log.warn({ status: res.status, code: e?.code, fbtraceId: e?.fbtrace_id }, "La Graph API rechazó el pedido");
  throw new WhatsAppApiError(message.slice(0, 500), res.status, e?.code, e?.fbtrace_id);
}

async function postMessage(payload: Record<string, unknown>): Promise<WhatsAppSendResponse> {
  const { phoneNumberId, base } = config();
  const res = await graphFetch(
    `${base}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
    },
    SEND_TIMEOUT_MS
  );
  if (!res.ok) return failFrom(res);
  return (await res.json()) as WhatsAppSendResponse;
}

/**
 * Texto libre. **Solo funciona dentro de las 24 h** desde el último mensaje del
 * cliente; fuera de la ventana Meta responde error 131047 y hay que usar una
 * plantilla (`sendTemplateMessage`).
 *
 * `to`: número en E.164 sin "+" (ver `normalizeWhatsappNumber`).
 */
export async function sendTextMessage(to: string, text: string): Promise<WhatsAppSendResponse> {
  return postMessage({ to, type: "text", text: { body: text, preview_url: false } });
}

/**
 * Plantilla aprobada. Es lo único que se puede mandar para *iniciar* una
 * conversación o fuera de la ventana de 24 h.
 *
 * `languageCode` tiene que coincidir con el idioma con que se aprobó la
 * plantilla (ej. "es_AR"); `components` lleva los valores de las variables.
 */
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  components?: WhatsAppTemplateComponent[]
): Promise<WhatsAppSendResponse> {
  return postMessage({
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components?.length ? { components } : {}),
    },
  });
}

/** Marca un mensaje entrante como leído (los dos tildes azules del lado del cliente). */
export async function markAsRead(wamid: string): Promise<void> {
  const { phoneNumberId, base } = config();
  const res = await graphFetch(
    `${base}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: wamid }),
    },
    SEND_TIMEOUT_MS
  );
  if (!res.ok) await failFrom(res);
}

/**
 * Baja un archivo que mandó el cliente, a partir del `media.id` del webhook.
 *
 * Son dos pasos: `GET /{media-id}` devuelve una URL temporal (vence a los 5
 * minutos) y esa URL se baja con el mismo token. Hay que llamarlo apenas llega
 * el webhook, no más tarde.
 */
export async function downloadMedia(
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string; fileSize: number }> {
  const { base } = config();

  const infoRes = await graphFetch(`${base}/${encodeURIComponent(mediaId)}`, { method: "GET" }, SEND_TIMEOUT_MS);
  if (!infoRes.ok) return failFrom(infoRes);
  const info = (await infoRes.json()) as WhatsAppMediaInfo;

  const fileRes = await graphFetch(info.url, { method: "GET" }, MEDIA_TIMEOUT_MS);
  if (!fileRes.ok) return failFrom(fileRes);

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return { buffer, mimeType: info.mime_type, fileSize: buffer.length };
}

/** Una plantilla tal como la devuelve `GET /{waba-id}/message_templates`. */
export type GraphTemplate = {
  name: string;
  language: string;
  status: string;
  category?: string;
  components?: { type: string; format?: string; text?: string; buttons?: { type: string; text?: string; url?: string }[] }[];
};

/**
 * Las plantillas de la cuenta (WABA). Necesita `WHATSAPP_WABA_ID` además del
 * token; devuelve todas, el que llama filtra por estado.
 */
export async function listTemplates(): Promise<GraphTemplate[]> {
  const { base } = config();
  const waba = process.env.WHATSAPP_WABA_ID;
  if (!waba) throw new WhatsAppApiError("Falta WHATSAPP_WABA_ID para listar las plantillas", 503);

  const out: GraphTemplate[] = [];
  let url: string | undefined =
    `${base}/${waba}/message_templates?fields=name,language,status,category,components&limit=100`;

  // Se sigue la paginación, con un tope por si Meta devolviera un ciclo.
  for (let page = 0; url && page < 10; page++) {
    const res = await graphFetch(url, { method: "GET" }, SEND_TIMEOUT_MS);
    if (!res.ok) return failFrom(res);
    const body = (await res.json()) as { data?: GraphTemplate[]; paging?: { next?: string } };
    out.push(...(body.data ?? []));
    url = body.paging?.next;
  }
  return out;
}
