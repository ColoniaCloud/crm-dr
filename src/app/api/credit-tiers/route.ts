import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/credit-tiers");

// GET — cualquier usuario autenticado (lo necesita el selector al crear una
// venta a consignación, no solo la pantalla de configuración).
export async function GET() {
  const gate = await requireRole();
  if (!gate.success) return gate.response;

  try {
    const tiers = await prisma.creditTier.findMany({
      where: { active: true },
      orderBy: { limit: "asc" },
      include: { _count: { select: { contacts: true } } },
    });
    return NextResponse.json(tiers);
  } catch (error) {
    log.error({ err: error }, "Error fetching credit tiers");
    return NextResponse.json({ error: "Error al obtener escalafones" }, { status: 500 });
  }
}

const createSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1),
  limit: z.number().positive(),
});

// POST — SUPERADMIN, desde /settings.
export async function POST(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const body = await request.json();
    const validation = validateBody(createSchema, body);
    if (!validation.success) return validation.response;

    const existing = await prisma.creditTier.findUnique({ where: { code: validation.data.code } });
    if (existing) {
      return NextResponse.json({ error: `Ya existe un escalafón con código "${validation.data.code}"` }, { status: 400 });
    }

    const tier = await prisma.creditTier.create({ data: validation.data });

    await logOperatorAction({
      userId: session.user.id,
      action: "CREATE_CREDIT_TIER",
      entityType: "CREDIT_TIER",
      entityId: tier.id,
      description: `Creó escalafón de crédito ${tier.code} (límite $${tier.limit})`,
      link: "/settings",
    });

    return NextResponse.json(tier, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating credit tier");
    return NextResponse.json({ error: "Error al crear el escalafón" }, { status: 500 });
  }
}
