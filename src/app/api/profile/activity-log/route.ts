import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCommsLogViewer } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/profile/activity-log");

function contactLabel(c: { firstName: string; lastName: string; company: string | null } | null): string | null {
  if (!c) return null;
  return c.company || `${c.firstName} ${c.lastName}`.trim();
}

async function fetchEmails(search: string, take: number, skip: number) {
  const where = search
    ? {
        OR: [
          { subject: { contains: search } },
          { toAddress: { contains: search } },
          { fromAddress: { contains: search } },
          { user: { name: { contains: search } } },
        ],
      }
    : {};

  const rows = await prisma.email.findMany({
    where,
    include: {
      user: { select: { id: true, name: true } },
      contact: { select: { firstName: true, lastName: true, company: true } },
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    skip,
  });

  const hasMore = rows.length > take;
  const items = rows.slice(0, take).map((r) => ({
    id: r.id,
    kind: "email" as const,
    direction: r.direction,
    status: r.status,
    subject: r.subject,
    fromAddress: r.fromAddress,
    toAddress: r.toAddress,
    userName: r.user.name,
    contactName: contactLabel(r.contact),
    read: r.read,
    createdAt: r.createdAt,
  }));

  return { items, hasMore };
}

/** Una línea legible de lo que contiene un mensaje de la Cloud API. */
function summarize(type: string, content: unknown): string {
  const c = (content ?? {}) as Record<string, unknown>;
  if (type === "text") return String((c.text as { body?: string } | undefined)?.body ?? "");
  if (type === "template") return `[Plantilla ${String((c.template as { name?: string } | undefined)?.name ?? "")}]`;
  if (type === "interactive") {
    const i = c.interactive as { button_reply?: { title?: string }; list_reply?: { title?: string } } | undefined;
    return i?.button_reply?.title ?? i?.list_reply?.title ?? "[interactive]";
  }
  if (type === "button") return String((c.button as { text?: string } | undefined)?.text ?? "[button]");
  const media = c[type] as { caption?: string } | undefined;
  return media?.caption ? `[${type}] ${media.caption}` : `[${type}]`;
}

/**
 * Mensajes de la WhatsApp Cloud API, entrantes y salientes. Los que el equipo
 * escribe desde el celular (modo coexistencia) entran como ecos salientes.
 */
async function fetchWhatsapp(search: string, take: number, skip: number) {
  const userIds = search
    ? (await prisma.user.findMany({ where: { name: { contains: search } }, select: { id: true } })).map((u) => u.id)
    : [];

  const where = search
    ? {
        OR: [
          { from: { contains: search } },
          { to: { contains: search } },
          { templateName: { contains: search } },
          ...(userIds.length ? [{ sentById: { in: userIds } }] : []),
        ],
      }
    : {};

  const rows = await prisma.whatsAppCloudMessage.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: take + 1,
    skip,
  });

  const hasMore = rows.length > take;
  const page = rows.slice(0, take);

  const senderIds = Array.from(new Set(page.map((m) => m.sentById).filter((id): id is string => !!id)));
  const contactIds = Array.from(new Set(page.map((m) => m.contactId).filter((id): id is string => !!id)));

  const [senders, contacts] = await Promise.all([
    senderIds.length
      ? prisma.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    contactIds.length
      ? prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, firstName: true, lastName: true, company: true } })
      : Promise.resolve([]),
  ]);
  const senderMap = new Map(senders.map((u) => [u.id, u.name]));
  const contactMap = new Map(contacts.map((c) => [c.id, c]));

  const items = page.map((m) => {
    const errors = Array.isArray(m.errors) ? (m.errors as { title?: string; message?: string }[]) : [];
    return {
      id: m.id,
      kind: "whatsapp" as const,
      direction: m.direction,
      status: m.status === "failed" ? ("FAILED" as const) : ("SENT" as const),
      error: m.status === "failed" ? (errors[0]?.title || errors[0]?.message || "No entregado") : null,
      phone: m.direction === "inbound" ? m.from : m.to,
      message: summarize(m.type, m.content),
      userName: m.sentById ? senderMap.get(m.sentById) ?? null : null,
      contactName: m.contactId ? contactLabel(contactMap.get(m.contactId) ?? null) : null,
      createdAt: m.timestamp,
    };
  });

  return { items, hasMore };
}

export async function GET(request: Request) {
  const gate = await requireCommsLogViewer();
  if (!gate.success) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") === "whatsapp" ? "whatsapp" : "email";
    const search = (searchParams.get("search") || "").trim();
    const take = Math.min(Number(searchParams.get("take")) || 30, 100);
    const skip = Math.max(Number(searchParams.get("skip")) || 0, 0);

    const result = type === "whatsapp"
      ? await fetchWhatsapp(search, take, skip)
      : await fetchEmails(search, take, skip);

    return NextResponse.json(result);
  } catch (error) {
    log.error({ err: error }, "Error fetching cross-user activity log");
    return NextResponse.json({ error: "Error al cargar el registro" }, { status: 500 });
  }
}
