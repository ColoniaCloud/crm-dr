import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mail");

export async function GET(request: Request) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get("contactId");
    const direction = searchParams.get("direction");
    const unread = searchParams.get("unread");
    const take = Math.min(Number(searchParams.get("take")) || 50, 100);

    const emails = await prisma.email.findMany({
      where: {
        userId: session.user.id,
        ...(contactId ? { contactId } : {}),
        ...(direction === "IN" || direction === "OUT" ? { direction } : {}),
        ...(unread === "true" ? { read: false } : {}),
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, company: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    return NextResponse.json(emails);
  } catch (error) {
    log.error({ err: error }, "Error fetching mail");
    return NextResponse.json({ error: "Error al cargar el correo" }, { status: 500 });
  }
}
