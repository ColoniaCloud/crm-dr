import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendNotification, escapeHtml, logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/calls/[id]");

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const call = await prisma.call.findUnique({
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
    if (!call) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(call);
  } catch (error) {
    log.error({ err: error }, "Unhandled error");
    return NextResponse.json({ error: "Error al obtener llamada" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json();
    const call = await prisma.call.update({
      where: { id },
      data: {
        ...body,
        ...(body.scheduledAt && { scheduledAt: new Date(body.scheduledAt) }),
        ...(body.completedAt && { completedAt: new Date(body.completedAt) }),
        ...(body.completed === true && !body.completedAt && { completedAt: new Date() }),
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Notify creator when call is completed by someone else
    if (body.completed === true && call.createdBy && session?.user?.id !== call.createdBy.id) {
      const contactName = `${call.contact.firstName} ${call.contact.lastName}`.trim();
      const completedBy = call.assignedTo?.name || session?.user?.name || "Alguien";
      await sendNotification({
        userId: call.createdBy.id,
        userEmail: call.createdBy.email!,
        userName: call.createdBy.name,
        type: "CALL_COMPLETED",
        title: "Llamada completada",
        message: `La llamada con <strong>${escapeHtml(contactName)}</strong> fue completada por <strong>${escapeHtml(completedBy)}</strong>.`,
        link: "/calendar/calls",
      });
    }

    const contactName = `${call.contact.firstName} ${call.contact.lastName}`.trim();
    const changes: string[] = [];
    if (body.completed === true) changes.push("completada");
    if (body.scheduledAt) changes.push("reprogramada");
    if (body.notes) changes.push("notas actualizadas");
    await logOperatorAction({
      userId: session.user.id,
      action: "UPDATE_CALL",
      entityType: "CALL",
      entityId: id,
      description: `Actualizó llamada con "${contactName}"${changes.length ? " · " + changes.join(", ") : ""}`,
      link: "/calendar/calls",
    });

    return NextResponse.json(call);
  } catch (error) {
    log.error({ err: error }, "Unhandled error");
    return NextResponse.json({ error: "Error al actualizar llamada" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const call = await prisma.call.findUnique({ where: { id }, include: { contact: { select: { firstName: true, lastName: true } } } });
    await prisma.call.delete({ where: { id } });
    const cName = call ? `${call.contact.firstName} ${call.contact.lastName}`.trim() : id;
    await logOperatorAction({ userId: session.user.id, action: "DELETE_CALL", entityType: "CALL", entityId: id, description: `Eliminó llamada con "${cName}"` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Unhandled error");
    return NextResponse.json({ error: "Error al eliminar llamada" }, { status: 500 });
  }
}
