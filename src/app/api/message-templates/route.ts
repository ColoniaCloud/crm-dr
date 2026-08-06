import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/message-templates");

// GET — cualquier usuario autenticado: los necesita el selector "Usar
// plantilla" al enviar, no solo la pantalla de configuración.
export async function GET(request: Request) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get("channel");

    const templates = await prisma.messageTemplate.findMany({
      where: {
        active: true,
        ...(channel === "MAIL" || channel === "WHATSAPP" ? { channel } : {}),
      },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(templates);
  } catch (error) {
    log.error({ err: error }, "Error fetching message templates");
    return NextResponse.json({ error: "Error al obtener plantillas" }, { status: 500 });
  }
}

const createSchema = z.object({
  channel: z.enum(["MAIL", "WHATSAPP"]),
  name: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().min(1),
});

// POST — SUPERADMIN, desde la pestaña "Configuración" de /mail o /whatsapp.
export async function POST(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const body = await request.json();
    const validation = validateBody(createSchema, body);
    if (!validation.success) return validation.response;

    const template = await prisma.messageTemplate.create({
      data: { ...validation.data, createdById: session.user.id },
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "CREATE_MESSAGE_TEMPLATE",
      entityType: "MESSAGE_TEMPLATE",
      entityId: template.id,
      description: `Creó plantilla "${template.name}" (${template.channel})`,
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating message template");
    return NextResponse.json({ error: "Error al crear la plantilla" }, { status: 500 });
  }
}
