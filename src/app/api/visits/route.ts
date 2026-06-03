import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendNotification, buildAssignmentMessage, escapeHtml, logOperatorAction, notifyAdmins } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/visits");

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
  if (upcoming) where.scheduledDate = { gte: new Date() };
  if (month && year) {
    const start = new Date(Number(year), Number(month) - 1, 1);
    const end = new Date(Number(year), Number(month), 1);
    where.scheduledDate = { gte: start, lt: end };
  }

  try {
    const visits = await prisma.visit.findMany({
      where,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, company: true } },
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { scheduledDate: "asc" },
    });
    return NextResponse.json(visits);
  } catch (error) {
    log.error({ err: error }, "Unhandled error");
    return NextResponse.json({ error: "Error al obtener visitas" }, { status: 500 });
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
    const { contactId, assignedToId, scheduledDate, notes } = body;

    if (!contactId || !scheduledDate) {
      return NextResponse.json({ error: "contactId y scheduledDate son requeridos" }, { status: 400 });
    }

    const finalAssignedId = assignedToId || session.user.id;

    const visit = await prisma.visit.create({
      data: {
        contactId,
        assignedToId: finalAssignedId,
        createdById: session.user.id,
        scheduledDate: new Date(scheduledDate),
        notes: notes || null,
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, company: true, phone: true, whatsapp: true, email: true, city: true, state: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    const contactName = visit.contact.company || `${visit.contact.firstName} ${visit.contact.lastName}`.trim();
    const operatorName = session.user.name || "Operador";
    const date = new Date(scheduledDate).toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    // Send notification when a visit is assigned
    if (visit.assignedTo) {
      const richMessage = buildAssignmentMessage({
        eventType: "visit",
        contact: {
          name: contactName,
          phone: visit.contact.phone,
          whatsapp: visit.contact.whatsapp,
          email: visit.contact.email,
          city: visit.contact.city,
          state: visit.contact.state,
        },
        scheduledAt: date,
        notes: notes || null,
      });
      await sendNotification({
        userId: visit.assignedTo.id,
        userEmail: visit.assignedTo.email,
        userName: visit.assignedTo.name,
        type: "VISIT_ASSIGNED",
        title: "Nueva visita asignada",
        message: richMessage,
        link: "/notifications",
        baseUrl: origin,
      });
    }

    await logOperatorAction({
      userId: session.user.id,
      action: "VISIT_SCHEDULED",
      entityType: "VISIT",
      entityId: visit.id,
      description: `Agendó una visita con "${contactName}" para el ${date}`,
      link: "/calendar/visits",
    });

    // Auto-create timeline activity
    try {
      const assigneeName = visit.assignedTo?.name || "Sin asignar";
      const schedulerName = visit.createdBy?.name || operatorName;
      await prisma.leadActivity.create({
        data: {
          contactId,
          userId: session.user.id,
          type: "VISIT",
          title: "Visita agendada",
          description: `Visita programada para ${date}\nAgendada por: ${schedulerName} · Asignada a: ${assigneeName}${notes ? `\nNotas: ${notes}` : ""}`,
        },
      });
    } catch { /* non-critical */ }

    if (session.user.role === "OPERATOR") {
      await notifyAdmins({
        type: "VISIT_SCHEDULED",
        title: "Visita agendada",
        message: `<strong>${escapeHtml(operatorName)}</strong> agendó una visita con <strong>${escapeHtml(contactName)}</strong> para el ${escapeHtml(date)}.`,
        link: "/calendar/visits",
      });
    }

    return NextResponse.json(visit, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Unhandled error");
    return NextResponse.json({ error: "Error al crear visita" }, { status: 500 });
  }
}
