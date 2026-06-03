import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendNotification, escapeHtml, logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/visits/[id]");

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const visit = await prisma.visit.findUnique({
      where: { id },
      include: {
        contact: {
          include: {
            leadActivities: {
              include: { user: { select: { name: true } } },
              orderBy: { createdAt: "desc" },
              take: 30,
            },
          },
        },
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!visit) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(visit);
  } catch (error) {
    log.error({ err: error }, "Unhandled error");
    return NextResponse.json({ error: "Error al obtener visita" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json();
    const visit = await prisma.visit.update({
      where: { id },
      data: {
        ...body,
        ...(body.scheduledDate && { scheduledDate: new Date(body.scheduledDate) }),
        ...(body.completedDate && { completedDate: new Date(body.completedDate) }),
        ...(body.completed === true && !body.completedDate && { completedDate: new Date() }),
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Notify creator when visit is completed by someone else
    if (body.completed === true && visit.createdBy && session?.user?.id !== visit.createdBy.id) {
      const contactName = `${visit.contact.firstName} ${visit.contact.lastName}`.trim();
      const completedBy = visit.assignedTo?.name || session?.user?.name || "Alguien";
      await sendNotification({
        userId: visit.createdBy.id,
        userEmail: visit.createdBy.email!,
        userName: visit.createdBy.name,
        type: "VISIT_COMPLETED",
        title: "Visita completada",
        message: `La visita con <strong>${escapeHtml(contactName)}</strong> fue completada por <strong>${escapeHtml(completedBy)}</strong>.`,
        link: "/calendar/visits",
      });
    }

    const contactName = `${visit.contact.firstName} ${visit.contact.lastName}`.trim();
    const changes: string[] = [];
    if (body.completed === true) changes.push("completada");
    if (body.scheduledDate) changes.push("reprogramada");
    if (body.notes) changes.push("notas actualizadas");
    await logOperatorAction({
      userId: session.user.id,
      action: "UPDATE_VISIT",
      entityType: "VISIT",
      entityId: id,
      description: `Actualizó visita con "${contactName}"${changes.length ? " · " + changes.join(", ") : ""}`,
      link: "/calendar/visits",
    });

    return NextResponse.json(visit);
  } catch (error) {
    log.error({ err: error }, "Unhandled error");
    return NextResponse.json({ error: "Error al actualizar visita" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const visit = await prisma.visit.findUnique({ where: { id }, include: { contact: { select: { firstName: true, lastName: true } } } });
    await prisma.visit.delete({ where: { id } });
    const cName = visit ? `${visit.contact.firstName} ${visit.contact.lastName}`.trim() : id;
    await logOperatorAction({ userId: session.user.id, action: "DELETE_VISIT", entityType: "VISIT", entityId: id, description: `Eliminó visita con "${cName}"` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Unhandled error");
    return NextResponse.json({ error: "Error al eliminar visita" }, { status: 500 });
  }
}
