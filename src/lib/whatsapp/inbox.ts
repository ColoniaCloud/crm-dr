import { prisma } from "@/lib/prisma";
import { esDemo } from "@/lib/demo-context";
import { WhatsAppApiError, sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp/client";
import { resolveContactForPeer } from "@/lib/whatsapp/contact-link";
import { viewMessage, previewOf, type MessageView } from "@/lib/whatsapp/message-view";
import { cleanParam, recordOutbound } from "@/lib/whatsapp/outbound";
import { formatWaNumber, peerKey, peerVariants } from "@/lib/whatsapp/peer";
import { normalizeWhatsappNumber } from "@/lib/whatsapp/phone";
import { getApprovedTemplates } from "@/lib/whatsapp/templates";

/**
 * La bandeja de WhatsApp: conversaciones, hilo de una conversación y envío.
 *
 * Una conversación no tiene tabla propia: es el conjunto de mensajes de
 * `whatsapp_cloud_messages` cuyo "otro lado" es el mismo número (ver `peer.ts`).
 */

/** WhatsApp solo deja escribir texto libre dentro de las 24 h del último mensaje del cliente. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Cuántos mensajes recientes se miran para armar la lista de conversaciones.
 * Con el volumen de hoy (un número, pocos chats) alcanza de sobra; si algún día
 * no, la lista pasa a una tabla de conversaciones propia.
 */
const LIST_SCAN_LIMIT = 3000;

export type ConversationSummary = {
  /** Clave de la conversación (ver `peerKey`); va en la URL. */
  peer: string;
  name: string;
  contactId: string | null;
  /** Dónde está la ficha en el CRM (null si el tipo no tiene pantalla de detalle). */
  contactHref: string | null;
  /** La ficha se creó sola al escribir (source WHATSAPP) y nadie la completó. */
  autoCreated: boolean;
  last: { direction: string; preview: string; timestamp: string; status: string | null };
  /** El último mensaje es del cliente y todavía no le respondimos. */
  awaitingReply: boolean;
  windowOpen: boolean;
};

export type ThreadMessage = {
  id: string;
  direction: string;
  view: MessageView;
  timestamp: string;
  status: string | null;
  /** Título del error si Meta marcó el mensaje como fallido. */
  error: string | null;
  templateName: string | null;
  sentById: string | null;
};

export type Thread = {
  peer: string;
  name: string;
  contactId: string | null;
  contactHref: string | null;
  number: string;
  windowOpen: boolean;
  windowExpiresAt: string | null;
  messages: ThreadMessage[];
  hasMore: boolean;
};

const otherSide = (m: { direction: string; from: string; to: string }) => (m.direction === "inbound" ? m.from : m.to);

// ─── Lista ───────────────────────────────────────────────────────────────────

export async function listConversations(query?: string): Promise<ConversationSummary[]> {
  const rows = await prisma.whatsAppCloudMessage.findMany({
    orderBy: { timestamp: "desc" },
    take: LIST_SCAN_LIMIT,
    select: {
      direction: true, from: true, to: true, type: true, content: true,
      timestamp: true, status: true, contactId: true,
    },
  });

  type Group = { key: string; waId: string; last: (typeof rows)[number]; lastInbound: Date | null; contactId: string | null };
  const groups = new Map<string, Group>();
  // `rows` viene del más nuevo al más viejo: el primero de cada número es el último mensaje.
  for (const r of rows) {
    const waId = otherSide(r);
    const key = peerKey(waId);
    if (!key) continue;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        key, waId, last: r,
        lastInbound: r.direction === "inbound" ? r.timestamp : null,
        contactId: r.contactId,
      });
      continue;
    }
    if (!g.lastInbound && r.direction === "inbound") g.lastInbound = r.timestamp;
    if (!g.contactId && r.contactId) g.contactId = r.contactId;
  }

  const names = await namesFor([...groups.values()]);
  const now = Date.now();

  const list = [...groups.values()].map((g): ConversationSummary => {
    const contact = g.contactId ? names.contacts.get(g.contactId) : undefined;
    return {
      peer: g.key,
      name: contact?.name ?? names.profiles.get(g.key) ?? formatWaNumber(g.waId),
      contactId: contact ? g.contactId : null,
      contactHref: contact?.href ?? null,
      autoCreated: contact?.autoCreated ?? false,
      last: {
        direction: g.last.direction,
        preview: previewOf(g.last.type, g.last.content),
        timestamp: g.last.timestamp.toISOString(),
        status: g.last.status,
      },
      awaitingReply: g.last.direction === "inbound",
      windowOpen: Boolean(g.lastInbound && now - g.lastInbound.getTime() < WINDOW_MS),
    };
  });

  const q = query?.trim().toLowerCase();
  const filtered = q
    ? list.filter((c) => c.name.toLowerCase().includes(q) || c.peer.includes(q.replace(/\D/g, "") || "\u0000"))
    : list;
  return filtered; // ya viene ordenado por el último mensaje
}

/** Pantalla de detalle de cada tipo de ficha (los instaladores solo tienen listado). */
const DETAIL_PATH: Record<string, string | undefined> = {
  LEAD: "/leads",
  CLIENT: "/clients",
  RESELLER: "/revendedores",
};

async function namesFor(groups: { key: string; contactId: string | null }[]) {
  const ids = [...new Set(groups.map((g) => g.contactId).filter((x): x is string => Boolean(x)))];
  const contacts = new Map<string, { name: string; autoCreated: boolean; href: string | null }>();
  if (ids.length) {
    const found = await prisma.contact.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, company: true, source: true, type: true },
    });
    for (const c of found) {
      const person = `${c.firstName} ${c.lastName}`.trim();
      contacts.set(c.id, {
        name: c.company ? (person ? `${c.company} · ${person}` : c.company) : person,
        autoCreated: c.source === "WHATSAPP",
        href: DETAIL_PATH[c.type] ? `${DETAIL_PATH[c.type]}/${c.id}` : null,
      });
    }
  }

  // Nombre de perfil de WhatsApp, para los números sin ficha.
  const profiles = new Map<string, string>();
  const waIds = groups.flatMap((g) => peerVariants(g.key));
  if (waIds.length) {
    const found = await prisma.whatsAppCloudContact.findMany({
      where: { waId: { in: waIds }, name: { not: null } },
      select: { waId: true, name: true },
    });
    for (const p of found) if (p.name) profiles.set(peerKey(p.waId), p.name);
  }
  return { contacts, profiles };
}

// ─── Hilo ────────────────────────────────────────────────────────────────────

const PAGE = 60;

export async function getThread(peer: string, before?: Date): Promise<Thread> {
  const key = peerKey(peer);
  const variants = peerVariants(key);
  const side = {
    OR: [
      { direction: "inbound", from: { in: variants } },
      { direction: "outbound", to: { in: variants } },
    ],
  };

  const rows = await prisma.whatsAppCloudMessage.findMany({
    where: { ...side, ...(before ? { timestamp: { lt: before } } : {}) },
    orderBy: { timestamp: "desc" },
    take: PAGE + 1,
    select: {
      id: true, direction: true, from: true, to: true, type: true, content: true, timestamp: true,
      status: true, errors: true, templateName: true, sentById: true, contactId: true,
    },
  });
  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE).reverse();

  const lastInbound = await prisma.whatsAppCloudMessage.findFirst({
    where: { direction: "inbound", from: { in: variants } },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  const expires = lastInbound ? new Date(lastInbound.timestamp.getTime() + WINDOW_MS) : null;

  const contactId = rows.find((r) => r.contactId)?.contactId ?? null;
  const names = await namesFor([{ key, contactId }]);
  const contact = contactId ? names.contacts.get(contactId) : undefined;
  const number = rows[0] ? otherSide(rows[0]) : key;

  return {
    peer: key,
    name: contact?.name ?? names.profiles.get(key) ?? formatWaNumber(number),
    contactId: contact ? contactId : null,
    contactHref: contact?.href ?? null,
    number: formatWaNumber(number),
    windowOpen: Boolean(expires && expires.getTime() > Date.now()),
    windowExpiresAt: expires && expires.getTime() > Date.now() ? expires.toISOString() : null,
    hasMore,
    messages: page.map((m) => ({
      id: m.id,
      direction: m.direction,
      view: viewMessage(m.type, m.content),
      timestamp: m.timestamp.toISOString(),
      status: m.status,
      error: firstErrorTitle(m.errors),
      templateName: m.templateName,
      sentById: m.sentById,
    })),
  };
}

function firstErrorTitle(errors: unknown): string | null {
  if (!Array.isArray(errors) || !errors.length) return null;
  const e = errors[0] as { title?: string; message?: string; code?: number };
  return e.title || e.message || (e.code ? `Error ${e.code}` : "Error");
}

// ─── Envío ───────────────────────────────────────────────────────────────────

export type SendInput =
  | { kind: "text"; text: string }
  | { kind: "template"; name: string; language: string; params: string[] };

export class InboxSendError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "InboxSendError";
  }
}

/** Manda un texto libre o una plantilla a una conversación y deja el registro. */
export async function sendToPeer(peer: string, input: SendInput, userId: string): Promise<{ wamid: string }> {
  // Ni siquiera con permisos: una sesión de demostración no manda mensajes reales.
  if (esDemo()) throw new InboxSendError("No disponible en la demostración", 403);

  const key = peerKey(peer);
  const variants = peerVariants(key);

  // A qué número escribirle: el que usó él la última vez (Meta lo escribe como 549… o 54…).
  const latest = await prisma.whatsAppCloudMessage.findFirst({
    where: { OR: [{ direction: "inbound", from: { in: variants } }, { direction: "outbound", to: { in: variants } }] },
    orderBy: { timestamp: "desc" },
    select: { direction: true, from: true, to: true },
  });
  const to = normalizeWhatsappNumber(latest ? otherSide(latest) : key);
  if (!to) throw new InboxSendError("Número inválido", 400);

  const contactId =
    (await prisma.whatsAppCloudMessage.findFirst({
      where: { contactId: { not: null }, OR: [{ direction: "inbound", from: { in: variants } }, { direction: "outbound", to: { in: variants } }] },
      orderBy: { timestamp: "desc" },
      select: { contactId: true },
    }))?.contactId ?? (await resolveContactForPeer({ waId: to, allowCreate: false }));

  try {
    if (input.kind === "text") {
      const text = input.text.trim();
      if (!text) throw new InboxSendError("El mensaje está vacío", 400);
      const open = await prisma.whatsAppCloudMessage.findFirst({
        where: { direction: "inbound", from: { in: variants }, timestamp: { gte: new Date(Date.now() - WINDOW_MS) } },
        select: { id: true },
      });
      if (!open) {
        throw new InboxSendError(
          "Pasaron más de 24 horas desde el último mensaje del cliente: solo se puede escribir con una plantilla.",
          409
        );
      }
      const response = await sendTextMessage(to, text);
      const wamid = response.messages?.[0]?.id;
      if (!wamid) throw new InboxSendError("Meta no devolvió el id del mensaje", 502);
      await recordOutbound({
        wamid, to, type: "text", content: { type: "text", text: { body: text } },
        response, contactId, sentById: userId,
      });
      return { wamid };
    }

    const template = (await getApprovedTemplates()).find(
      (t) => t.name === input.name && t.language === input.language
    );
    if (!template) throw new InboxSendError("La plantilla no existe o no está aprobada", 400);
    if (template.unsupported) throw new InboxSendError(`No se puede mandar desde la bandeja: ${template.unsupported}`, 400);
    if (input.params.length !== template.variableCount) {
      throw new InboxSendError(`La plantilla pide ${template.variableCount} variable(s)`, 400);
    }
    if (input.params.some((p) => !p.trim())) throw new InboxSendError("Completá todas las variables", 400);

    const components = template.variableCount
      ? [{ type: "body" as const, parameters: input.params.map((p) => ({ type: "text" as const, text: cleanParam(p) })) }]
      : undefined;
    const response = await sendTemplateMessage(to, template.name, template.language, components);
    const wamid = response.messages?.[0]?.id;
    if (!wamid) throw new InboxSendError("Meta no devolvió el id del mensaje", 502);
    await recordOutbound({
      wamid, to, type: "template",
      content: {
        type: "template",
        template: { name: template.name, language: { code: template.language }, ...(components ? { components } : {}) },
      },
      templateName: template.name, response, contactId, sentById: userId,
    });
    return { wamid };
  } catch (err) {
    if (err instanceof InboxSendError) throw err;
    if (err instanceof WhatsAppApiError) {
      if (err.code === 131047) {
        throw new InboxSendError("Fuera de la ventana de 24 horas: hay que usar una plantilla.", 409);
      }
      throw new InboxSendError(err.message || "Meta rechazó el mensaje", err.httpStatus === 503 ? 503 : 502);
    }
    throw err;
  }
}

// ─── Estado de un número ─────────────────────────────────────────────────────

export type PeerStatus = {
  peer: string;
  /** Alguna vez hubo mensajes con este número (en cualquier sentido). */
  hasConversation: boolean;
  /** Pasaron menos de 24 h desde el último mensaje del cliente. */
  windowOpen: boolean;
};

/**
 * Qué pasó ya con un número, para decidir qué hacer al tocar su botón de
 * WhatsApp: si nunca se le escribió hay que abrir con una plantilla; si ya hay
 * conversación, se sigue en la bandeja.
 */
export async function getPeerStatus(peer: string): Promise<PeerStatus> {
  const key = peerKey(peer);
  const variants = peerVariants(key);
  const side = {
    OR: [
      { direction: "inbound", from: { in: variants } },
      { direction: "outbound", to: { in: variants } },
    ],
  };

  const any = await prisma.whatsAppCloudMessage.findFirst({ where: side, select: { id: true } });
  const open = await prisma.whatsAppCloudMessage.findFirst({
    where: { direction: "inbound", from: { in: variants }, timestamp: { gte: new Date(Date.now() - WINDOW_MS) } },
    select: { id: true },
  });
  return { peer: key, hasConversation: Boolean(any), windowOpen: Boolean(open) };
}
