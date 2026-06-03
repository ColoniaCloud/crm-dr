import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/leads/[id]/activities");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;

    const activities = await prisma.leadActivity.findMany({
      where: { contactId: id },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(activities);
  } catch (error) {
    log.error({ err: error }, "Error fetching lead activities");
    return NextResponse.json(
      { error: "Error al cargar actividades" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { type, title, description } = body;

    if (!type || !title) {
      return NextResponse.json(
        { error: "Tipo y título son requeridos" },
        { status: 400 }
      );
    }

    const validTypes = ["NOTE", "EMAIL_SENT", "QUOTE_SENT", "VISIT", "CALL", "STATUS_CHANGE", "OTHER"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Tipo de actividad inválido" },
        { status: 400 }
      );
    }

    // Verify contact exists
    const contact = await prisma.contact.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, company: true },
    });
    if (!contact) {
      return NextResponse.json(
        { error: "Contacto no encontrado" },
        { status: 404 }
      );
    }

    const activity = await prisma.leadActivity.create({
      data: {
        contactId: id,
        userId: session.user.id,
        type,
        title,
        description: description || null,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    // Log operator action
    const contactName = contact.company || `${contact.firstName} ${contact.lastName}`.trim();
    await logOperatorAction({
      userId: session.user.id,
      action: "ADD_LEAD_ACTIVITY",
      entityType: "LEAD",
      entityId: id,
      description: `Agregó ${type === "NOTE" ? "nota" : "actividad"} en "${contactName}": ${title}`,
      link: `/leads/${id}`,
    });

    return NextResponse.json(activity, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating lead activity");
    return NextResponse.json(
      { error: "Error al crear actividad" },
      { status: 500 }
    );
  }
}
