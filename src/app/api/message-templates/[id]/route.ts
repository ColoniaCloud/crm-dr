import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/message-templates/[id]");

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  subject: z.string().optional(),
  body: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

// PATCH — SUPERADMIN. `active: false` es cómo se "borra" una plantilla sin
// perder el historial de qué se usó en mensajes ya enviados.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id } = await params;
    const body = await request.json();
    const validation = validateBody(updateSchema, body);
    if (!validation.success) return validation.response;

    const template = await prisma.messageTemplate.update({ where: { id }, data: validation.data });

    await logOperatorAction({
      userId: session.user.id,
      action: "UPDATE_MESSAGE_TEMPLATE",
      entityType: "MESSAGE_TEMPLATE",
      entityId: id,
      description: `Actualizó plantilla "${template.name}"`,
    });

    return NextResponse.json(template);
  } catch (error) {
    log.error({ err: error }, "Error updating message template");
    return NextResponse.json({ error: "Error al actualizar la plantilla" }, { status: 500 });
  }
}
