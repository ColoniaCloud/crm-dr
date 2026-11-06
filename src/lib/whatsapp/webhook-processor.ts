import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import type {
  WhatsAppEchoesValue,
  WhatsAppEchoMessage,
  WhatsAppInboundMessage,
  WhatsAppMessagesValue,
  WhatsAppMetadata,
  WhatsAppStatus,
  WhatsAppStatusValue,
  WhatsAppWebhookContact,
  WhatsAppWebhookPayload,
} from "@/types/whatsapp";

const log = createLogger("lib/whatsapp/webhook-processor");

/**
 * Persiste lo que Meta manda por webhook.
 *
 * Se llama **después** de haber respondido 200 (ver la ruta), así que no hay
 * nadie a quien devolverle un error: cada elemento va en su propio try/catch
 * para que un mensaje que no se puede guardar no arrastre a los demás del
 * mismo lote. Lo que falla se loguea con el wamid.
 *
 * Es idempotente: Meta reintenta los webhooks y puede entregar el mismo evento
 * dos veces, así que todo se escribe con el `wamid` como clave.
 */
export async function processWhatsAppWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      try {
        if (change.field === "messages") {
          await processMessagesValue(entry.id, change.value as WhatsAppMessagesValue);
        } else if (change.field === "smb_message_echoes") {
          await processEchoesValue(entry.id, change.value as WhatsAppEchoesValue);
        } else {
          // Plantillas, calidad del número, historial de coexistencia, etc.
          // Todavía no se usan; se anota para saber qué está llegando.
          log.info({ field: change.field, wabaId: entry.id }, "Evento de WhatsApp ignorado");
        }
      } catch (err) {
        log.error({ err, field: change.field, wabaId: entry.id }, "Falló el procesamiento de un cambio");
      }
    }
  }
}

// ─── field: "messages" ───────────────────────────────────────────────────────

async function processMessagesValue(wabaId: string, value: WhatsAppMessagesValue): Promise<void> {
  const { metadata } = value;

  for (const contact of value.contacts ?? []) {
    await guarded("contacto", contact.wa_id, () => upsertContact(contact));
  }

  for (const message of value.messages ?? []) {
    await guarded("mensaje entrante", message.id, () =>
      saveInboundMessage(wabaId, metadata, message, value)
    );
  }

  for (const status of value.statuses ?? []) {
    await guarded("estado", status.id, () => applyStatus(wabaId, metadata, status, value));
  }

  for (const error of value.errors ?? []) {
    log.warn({ wabaId, code: error.code, title: error.title }, "Meta reportó un error de cuenta");
  }
}

async function upsertContact(contact: WhatsAppWebhookContact): Promise<void> {
  const name = contact.profile?.name ?? null;
  const profile = contact.profile ? toJson(contact.profile) : Prisma.JsonNull;

  await prisma.whatsAppCloudContact.upsert({
    where: { waId: contact.wa_id },
    create: { waId: contact.wa_id, name, profile },
    // El nombre de perfil lo cambia el usuario cuando quiere: se pisa con el
    // último que vimos, salvo que este evento no lo traiga.
    update: { lastSeen: new Date(), ...(name ? { name, profile } : {}) },
  });
}

async function saveInboundMessage(
  wabaId: string,
  metadata: WhatsAppMetadata,
  message: WhatsAppInboundMessage,
  rawValue: WhatsAppMessagesValue
): Promise<void> {
  await insertIgnoringDuplicate({
    wamid: message.id,
    direction: "inbound",
    from: message.from,
    to: digitsOnly(metadata.display_phone_number),
    type: message.type,
    content: toJson(message),
    timestamp: fromEpochSeconds(message.timestamp),
    status: null,
    phoneNumberId: metadata.phone_number_id,
    wabaId,
    rawPayload: toJson(rawValue),
  });
}

// ─── Estados ─────────────────────────────────────────────────────────────────

/** `failed` se acepta siempre; el resto solo avanza (sent → delivered → read). */
const STATUS_RANK: Record<WhatsAppStatusValue, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

async function applyStatus(
  wabaId: string,
  metadata: WhatsAppMetadata,
  status: WhatsAppStatus,
  rawValue: WhatsAppMessagesValue
): Promise<void> {
  const at = fromEpochSeconds(status.timestamp);
  const errors = status.errors ? toJson(status.errors) : undefined;

  const existing = await prisma.whatsAppCloudMessage.findUnique({
    where: { wamid: status.id },
    select: { status: true },
  });

  if (!existing) {
    // El estado llegó antes que el mensaje (o el mensaje salió por otra vía que
    // no lo registró). Se deja una fila mínima para no perder el estado; si el
    // mensaje aparece después, `insertIgnoringDuplicate` no la pisa, pero el
    // `type` "unknown" delata que falta el contenido.
    await insertIgnoringDuplicate({
      wamid: status.id,
      direction: "outbound",
      from: digitsOnly(metadata.display_phone_number),
      to: status.recipient_id,
      type: "unknown",
      content: {},
      timestamp: at,
      status: status.status,
      statusUpdatedAt: at,
      errors,
      phoneNumberId: metadata.phone_number_id,
      wabaId,
      rawPayload: toJson(rawValue),
    });
    return;
  }

  // Los estados pueden llegar desordenados ("read" antes que "delivered").
  // Un estado más viejo no tiene que pisar a uno más nuevo.
  const current = existing.status as WhatsAppStatusValue | null;
  if (current && STATUS_RANK[current] >= STATUS_RANK[status.status] && status.status !== "failed") {
    return;
  }

  await prisma.whatsAppCloudMessage.update({
    where: { wamid: status.id },
    data: {
      status: status.status,
      statusUpdatedAt: at,
      ...(errors ? { errors } : {}),
    },
  });
}

// ─── field: "smb_message_echoes" ─────────────────────────────────────────────

async function processEchoesValue(wabaId: string, value: WhatsAppEchoesValue): Promise<void> {
  for (const echo of value.message_echoes ?? []) {
    await guarded("eco", echo.id, () => saveEcho(wabaId, value, echo));
  }
}

async function saveEcho(
  wabaId: string,
  value: WhatsAppEchoesValue,
  echo: WhatsAppEchoMessage
): Promise<void> {
  await insertIgnoringDuplicate({
    wamid: echo.id,
    direction: "outbound",
    from: echo.from,
    to: echo.to,
    type: echo.type,
    content: toJson(echo),
    timestamp: fromEpochSeconds(echo.timestamp),
    // Lo escribió una persona desde el celular: ya salió.
    status: "sent",
    statusUpdatedAt: fromEpochSeconds(echo.timestamp),
    phoneNumberId: value.metadata.phone_number_id,
    wabaId,
    rawPayload: toJson(value),
  });
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

type NewMessage = {
  wamid: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  type: string;
  content: Prisma.InputJsonValue;
  timestamp: Date;
  status: WhatsAppStatusValue | null;
  statusUpdatedAt?: Date;
  errors?: Prisma.InputJsonValue;
  phoneNumberId: string;
  wabaId: string;
  rawPayload: Prisma.InputJsonValue;
};

/**
 * Inserta el mensaje; si ya existe ese `wamid` (reintento de Meta, o dos
 * entregas simultáneas) no hace nada. Va con `create` + captura de P2002 en vez
 * de `upsert` porque dos upserts concurrentes sobre una clave única también
 * chocan, y acá el choque es el resultado esperado, no un error.
 */
async function insertIgnoringDuplicate(data: NewMessage): Promise<void> {
  try {
    await prisma.whatsAppCloudMessage.create({ data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
}

async function guarded(what: string, id: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    log.error({ err, id }, `No se pudo guardar ${what} de WhatsApp`);
  }
}

/** Meta manda el epoch en segundos, como string. */
function fromEpochSeconds(value: string): Date {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
}

function digitsOnly(value: string): string {
  return (value || "").replace(/\D/g, "");
}

/** El payload ya es JSON puro; el cast evita enumerar cada variante para Prisma. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
