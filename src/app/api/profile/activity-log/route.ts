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

async function fetchWhatsapp(search: string, take: number, skip: number) {
  const userMatches = search
    ? await prisma.user.findMany({ where: { name: { contains: search } }, select: { id: true } })
    : [];
  const userIds = userMatches.map((u) => u.id);

  const where = search
    ? {
        OR: [
          { message: { contains: search } },
          { phone: { contains: search } },
          ...(userIds.length ? [{ sentById: { in: userIds } }] : []),
        ],
      }
    : {};

  const rows = await prisma.whatsAppMessage.findMany({
    where,
    orderBy: { sentAt: "desc" },
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

  const items = page.map((m) => ({
    id: m.id,
    kind: "whatsapp" as const,
    status: m.status,
    error: m.error,
    phone: m.phone,
    message: m.message,
    userName: m.sentById ? senderMap.get(m.sentById) ?? null : null,
    contactName: m.contactId ? contactLabel(contactMap.get(m.contactId) ?? null) : null,
    createdAt: m.sentAt,
  }));

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
