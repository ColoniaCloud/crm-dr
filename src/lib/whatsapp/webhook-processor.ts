import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { resolveContactForPeer } from "@/lib/whatsapp/contact-link";
import { isPrimaryPhoneNumberId } from "@/lib/whatsapp/lines";
import { STUB_CONTENT, STUB_TYPE } from "@/lib/whatsapp/stub";
import type {
  WhatsAppEchoesValue,
  WhatsAppEchoMessage,
  WhatsAppHistoryValue,
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
        } else if (change.field === "history") {
          await processHistoryValue(entry.id, change.value as WhatsAppHistoryValue);
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
  // Quien nos escribe puede no estar en el CRM: se lo busca por teléfono y, si
  // no está, se crea una ficha provisoria (ver contact-link.ts).
  //
  // Solo en la línea principal. Las otras son números en coexistencia, que
  // también reciben lo que no es del negocio (el celular de una persona): un
  // desconocido que escribe ahí se vincula si ya tiene ficha, pero no genera un
  // lead ni un aviso a todo el equipo.
  const profileName = rawValue.contacts?.find((c) => c.wa_id === message.from)?.profile?.name;
  const contactId = await resolveContactForPeer({
    waId: message.from,
    profileName,
    allowCreate: isPrimaryPhoneNumberId(metadata.phone_number_id),
  });

  await saveMessage({
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
    contactId,
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

  // Un solo UPDATE condicionado, en vez de leer y después escribir: dos estados
  // pegados (delivered y read) no se pisan entre sí. Los estados pueden llegar
  // desordenados ("read" antes que "delivered") y uno más viejo no tiene que
  // pisar a uno más nuevo; `failed` se acepta siempre.
  const advance = () =>
    prisma.whatsAppCloudMessage.updateMany({
      where: {
        wamid: status.id,
        ...(status.status === "failed"
          ? {}
          : { OR: [{ status: null }, { status: { in: statusesBelow(status.status) } }] }),
      },
      data: {
        status: status.status,
        statusUpdatedAt: at,
        ...(errors ? { errors } : {}),
      },
    });

  if ((await advance()).count > 0) return;

  // Cero filas: o el mensaje no existe, o ya estaba en un estado igual o más
  // avanzado (reintento de Meta, o llegada desordenada). Solo el primer caso
  // pide una fila nueva.
  const exists = await prisma.whatsAppCloudMessage.findUnique({
    where: { wamid: status.id },
    select: { id: true },
  });
  if (exists) return;

  // El estado llegó antes que el mensaje, o el mensaje salió por una vía que no
  // lo registró (el celular sin el eco suscripto, la consola de Meta, otra
  // herramienta). Se deja una fila mínima marcada como tal para no perder el
  // estado. Si el mensaje aparece después (`saveMessage`), la completa.
  const contactId = await resolveContactForPeer({ waId: status.recipient_id, allowCreate: false });
  const created = await createIfAbsent({
    wamid: status.id,
    direction: "outbound",
    from: digitsOnly(metadata.display_phone_number),
    to: status.recipient_id,
    type: STUB_TYPE,
    content: STUB_CONTENT,
    timestamp: at,
    status: status.status,
    statusUpdatedAt: at,
    errors,
    phoneNumberId: metadata.phone_number_id,
    wabaId,
    contactId,
    rawPayload: toJson(rawValue),
  });
  if (created) return;

  // Perdimos la carrera contra otra entrega del mismo mensaje: la fila ya
  // existe, así que ahora sí alcanza con avanzarla.
  await advance();
}

/** Los estados que `next` puede reemplazar (los de menor rango). */
function statusesBelow(next: WhatsAppStatusValue): WhatsAppStatusValue[] {
  return (Object.keys(STATUS_RANK) as WhatsAppStatusValue[]).filter((s) => STATUS_RANK[s] < STATUS_RANK[next]);
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
  // Lo escribimos nosotros: se vincula a una ficha que exista, pero no se crea
  // una nueva (no es alguien que nos buscó).
  const contactId = await resolveContactForPeer({ waId: echo.to, allowCreate: false });

  await saveMessage({
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
    contactId,
    rawPayload: toJson(value),
  });
}

// ─── field: "history" ────────────────────────────────────────────────────────

/** El estado del historial (`history_context.status`) en los términos de `status`. */
const HISTORY_STATUS: Record<string, WhatsAppStatusValue> = {
  SENT: "sent",
  DELIVERED: "delivered",
  READ: "read",
  PLAYED: "read",
  ERROR: "failed",
};

/**
 * Los chats viejos de un número que se acaba de conectar en coexistencia. Se
 * guardan igual que los mensajes en vivo, así la conversación aparece entera en
 * la bandeja de su línea. Es idempotente por `wamid`: si Meta repite una parte,
 * no se duplica nada.
 *
 * El sentido sale de `from`: si es el número del negocio, lo mandamos nosotros.
 * Un hilo sin número (Meta a veces solo da un id interno) no se puede ubicar en
 * ninguna conversación y se saltea. No se crean fichas: son contactos de antes.
 */
async function processHistoryValue(wabaId: string, value: WhatsAppHistoryValue): Promise<void> {
  const business = digitsOnly(value.metadata?.display_phone_number ?? "");
  let saved = 0;
  let skipped = 0;

  for (const chunk of value.history ?? []) {
    for (const error of chunk.errors ?? []) {
      log.info({ wabaId, code: error.code, title: error.title }, "El historial no se compartió");
    }

    for (const thread of chunk.threads ?? []) {
      const peer = digitsOnly(thread.context?.wa_id ?? thread.id ?? "");
      if (!peer) {
        skipped += thread.messages?.length ?? 0;
        continue;
      }
      const contactId = await resolveContactForPeer({ waId: peer, allowCreate: false });

      for (const message of thread.messages ?? []) {
        const outbound = Boolean(business) && digitsOnly(message.from ?? "") === business;
        const at = fromEpochSeconds(message.timestamp);
        await guarded("mensaje del historial", message.id, () =>
          saveMessage({
            wamid: message.id,
            direction: outbound ? "outbound" : "inbound",
            from: outbound ? business : peer,
            to: outbound ? peer : business,
            type: message.type,
            content: toJson(message),
            timestamp: at,
            status: outbound ? (HISTORY_STATUS[message.history_context?.status ?? ""] ?? "sent") : null,
            ...(outbound ? { statusUpdatedAt: at } : {}),
            phoneNumberId: value.metadata.phone_number_id,
            wabaId,
            contactId,
            rawPayload: toJson({ metadata: value.metadata, chunk: chunk.metadata, thread: thread.id }),
          })
        );
        saved++;
      }
    }
  }

  const progress = value.history?.map((c) => c.metadata?.progress).filter((p) => p !== undefined);
  log.info({ wabaId, saved, skipped, progress }, "Parte del historial de coexistencia procesada");
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
  /** Ficha del CRM a la que se vincula, si se la encontró. */
  contactId?: string | null;
  rawPayload: Prisma.InputJsonValue;
};

/**
 * Guarda un mensaje real (entrante o eco del celular). Idempotente por `wamid`:
 *   - no existe → se crea;
 *   - existe y es una fila mínima de un estado que llegó antes → se completa con
 *     el contenido real, **sin tocar el estado**, que ya es el más avanzado que
 *     vimos (un eco entra como "sent", el rango más bajo);
 *   - existe y ya es un mensaje → reintento de Meta, no se hace nada.
 */
async function saveMessage(data: NewMessage): Promise<void> {
  if (await createIfAbsent(data)) return;

  await prisma.whatsAppCloudMessage.updateMany({
    where: { wamid: data.wamid, type: STUB_TYPE },
    data: {
      direction: data.direction,
      from: data.from,
      to: data.to,
      type: data.type,
      content: data.content,
      timestamp: data.timestamp,
      phoneNumberId: data.phoneNumberId,
      wabaId: data.wabaId,
      ...(data.contactId ? { contactId: data.contactId } : {}),
      rawPayload: data.rawPayload,
    },
  });
}

/**
 * Crea la fila; devuelve `false` si ese `wamid` ya existía. Va con `create` +
 * captura de P2002 en vez de `upsert` porque dos upserts concurrentes sobre una
 * clave única también chocan, y acá el choque es el resultado esperado.
 */
async function createIfAbsent(data: NewMessage): Promise<boolean> {
  try {
    await prisma.whatsAppCloudMessage.create({ data });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
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
