import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
const log = createLogger("api/leads/[id]/visits");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { assignedToId, scheduledDate, notes } = body;

    const contact = await prisma.contact.findUnique({
      where: { id },
    });

    if (!contact) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    const visit = await prisma.visit.create({
      data: {
        contactId: id,
        assignedToId,
        createdById: session.user.id,
        scheduledDate: new Date(scheduledDate),
        notes,
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const vName = contact.company || `${contact.firstName} ${contact.lastName}`.trim();
    await logOperatorAction({ userId: session.user.id, action: "CREATE_VISIT", entityType: "VISIT", entityId: visit.id, description: `Creó visita para "${vName}"`, link: `/leads/${id}` });
    return NextResponse.json(visit, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating visit");
    return NextResponse.json(
      { error: "Error creating visit" },
      { status: 500 }
    );
  }
}
