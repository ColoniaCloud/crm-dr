import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/credit-tiers/[id]");

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  limit: z.number().positive().optional(),
  active: z.boolean().optional(),
});

// PATCH — SUPERADMIN. `code` no se puede cambiar (es la identidad del
// escalafón); si hace falta renombrarlo del todo, se da de baja (`active:
// false`, deja de ofrecerse en el selector, pero los clientes que ya lo
// tienen asignado lo conservan) y se crea uno nuevo.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id } = await params;
    const body = await request.json();
    const validation = validateBody(updateSchema, body);
    if (!validation.success) return validation.response;

    const tier = await prisma.creditTier.update({ where: { id }, data: validation.data });

    await logOperatorAction({
      userId: session.user.id,
      action: "UPDATE_CREDIT_TIER",
      entityType: "CREDIT_TIER",
      entityId: id,
      description: `Actualizó escalafón de crédito ${tier.code}`,
      link: "/settings",
    });

    return NextResponse.json(tier);
  } catch (error) {
    log.error({ err: error }, "Error updating credit tier");
    return NextResponse.json({ error: "Error al actualizar el escalafón" }, { status: 500 });
  }
}
