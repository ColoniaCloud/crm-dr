import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/leads/[id]/convert");

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const lead = await prisma.contact.findFirst({
      where: { id, type: "LEAD" },
      select: { id: true, firstName: true, lastName: true, company: true },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
    }

    const updated = await prisma.contact.update({
      where: { id },
      data: { type: "CLIENT" },
    });

    // Log activity
    const contactName = lead.company || `${lead.firstName} ${lead.lastName}`.trim();
    await prisma.leadActivity.create({
      data: {
        contactId: id,
        userId: session.user.id,
        type: "STATUS_CHANGE",
        title: "Convertido a Cliente",
        description: `${contactName} fue convertido de Lead a Cliente.`,
      },
    });

    log.info({ leadId: id, userId: session.user.id }, "Lead converted to client");

    await logOperatorAction({
      userId: session.user.id,
      action: "CONVERT_LEAD",
      entityType: "LEAD",
      entityId: id,
      description: `Convirtió lead "${contactName}" a Cliente`,
      link: `/clients/${id}`,
    });

    return NextResponse.json(updated);
  } catch (error) {
    log.error({ err: error }, "Error converting lead to client");
    return NextResponse.json(
      { error: "Error al convertir lead a cliente" },
      { status: 500 }
    );
  }
}
