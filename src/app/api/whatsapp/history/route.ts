import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/whatsapp/history");

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const messages = await prisma.whatsAppMessage.findMany({
      orderBy: { sentAt: "desc" },
      take: 50,
    });

    const contactIds = Array.from(
      new Set(messages.map((m) => m.contactId).filter((id): id is string => !!id))
    );
    const contacts = contactIds.length
      ? await prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, firstName: true, lastName: true, company: true },
        })
      : [];
    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    const enriched = messages.map((m) => {
      const c = m.contactId ? contactMap.get(m.contactId) : null;
      return {
        id: m.id,
        contactId: m.contactId,
        contactName: c
          ? c.company || `${c.firstName} ${c.lastName}`.trim()
          : null,
        phone: m.phone,
        message: m.message,
        status: m.status,
        error: m.error,
        sentAt: m.sentAt,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    log.error({ err: error }, "Error fetching WhatsApp history");
    return NextResponse.json({ error: "Error obteniendo historial" }, { status: 500 });
  }
}
