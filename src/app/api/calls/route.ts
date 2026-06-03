import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendNotification, buildAssignmentMessage, escapeHtml, logOperatorAction, notifyAdmins } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/calls");

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");
  const upcoming = searchParams.get("upcoming") === "true";
  const month = searchParams.get("month"); // 1-12
  const year = searchParams.get("year");

  const where: Record<string, unknown> = {};
  if (contactId) where.contactId = contactId;
  if (upcoming) where.scheduledAt = { gte: new Date() };
  if (month && year) {
    const start = new Date(Number(year), Number(month) - 1, 1);
    const end = new Date(Number(year), Number(month), 1);
    where.scheduledAt = { gte: start, lt: end };
  }

  try {
    const calls = await prisma.call.findMany({
      where,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, company: true } },
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });
    return NextResponse.json(calls);
  } catch (error) {
    log.error({ err: error }, "Unhandled error");
    return NextResponse.json({ error: "Error al obtener llamadas" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { origin } = new URL(request.url);

  try {
    const body = await request.json();
    const { contactId, assignedToId, scheduledAt, durationMin, notes } = body;

    if (!contactId || !scheduledAt) {
      return NextResponse.json({ error: "contactId y scheduledAt son requeridos" }, { status: 400 });
    }

    const finalAssignedId = assignedToId || session.user.id;

    const call = await prisma.call.create({
      data: {
        contactId,
        assignedToId: finalAssignedId,
        createdById: session.user.id,
        scheduledAt: new Date(scheduledAt),
        durationMin: durationMin ? Number(durationMin) : null,
        notes: notes || null,
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, company: true, phone: true, whatsapp: true, email: true, city: true, state: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    const contactName = call.contact.company || `${call.contact.firstName} ${call.contact.lastName}`.trim();
    const operatorName = session.user.name || "Operador";
    const date = new Date(scheduledAt).toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    const duration = durationMin ? ` (${durationMin} min)` : "";

    // Send notification when a call is assigned
    if (call.assignedTo) {
      const richMessage = buildAssignmentMessage({
        eventType: "call",
        contact: {
          name: contactName,
          phone: call.contact.phone,
          whatsapp: call.contact.whatsapp,
          email: call.contact.email,
          city: call.contact.city,
          state: call.contact.state,
        },
        scheduledAt: date,
        durationMin: durationMin ? Number(durationMin) : null,
        notes: notes || null,
      });
      await sendNotification({
        userId: call.assignedTo.id,
        userEmail: call.assignedTo.email,
        userName: call.assignedTo.name,
        type: "CALL_ASSIGNED",
        title: "Nueva llamada asignada",
        message: richMessage,
        link: "/notifications",
        baseUrl: origin,
      });
    }

    await logOperatorAction({
      userId: session.user.id,
      action: "CALL_SCHEDULED",
      entityType: "CALL",
      entityId: call.id,
      description: `Agendó una llamada con "${contactName}" para el ${date}${duration}`,
      link: "/calendar/calls",
    });

    // Auto-create timeline activity
    try {
      const assigneeName = call.assignedTo?.name || "Sin asignar";
      const schedulerName = call.createdBy?.name || operatorName;
      await prisma.leadActivity.create({
        data: {
          contactId,
          userId: session.user.id,
          type: "CALL",
          title: "Llamada agendada",
          description: `Llamada programada para ${date}${duration}\nAgendada por: ${schedulerName} · Asignada a: ${assigneeName}${notes ? `\nNotas: ${notes}` : ""}`,
        },
      });
    } catch { /* non-critical */ }

    if (session.user.role === "OPERATOR") {
      await notifyAdmins({
        type: "CALL_SCHEDULED",
        title: "Llamada agendada",
        message: `<strong>${escapeHtml(operatorName)}</strong> agendó una llamada con <strong>${escapeHtml(contactName)}</strong> para el ${escapeHtml(date)}${escapeHtml(duration)}.`,
        link: "/calendar/calls",
      });
    }

    return NextResponse.json(call, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Unhandled error");
    return NextResponse.json({ error: "Error al crear llamada" }, { status: 500 });
  }
}
