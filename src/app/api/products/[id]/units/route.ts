import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { ensureWarrantyRolls } from "@/lib/warranty";
import { createProductUnits } from "@/lib/product-units";
import { requireRole } from "@/lib/api-auth";
const log = createLogger("api/products/[id]/units");

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;

  try {
    const { id } = await params;
    const units = await prisma.productUnit.findMany({
      where: { productId: id },
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(units);
  } catch {
    return NextResponse.json({ error: "Error al obtener unidades" }, { status: 500 });
  }
}

// Generates trazability codes to catch up with stock that doesn't have them
// yet (e.g. legacy stock loaded before this system existed). Does NOT add to
// stock — stock only moves via purchase orders / stock movements, which
// generate their own matching codes automatically. Capped to the gap between
// current stock and units already coded, so this can never outrun reality.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id: productId } = await params;
    const { quantity } = await request.json().catch(() => ({}));

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { stock: true },
    });
    if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    const existingCount = await prisma.productUnit.count({ where: { productId } });
    const gap = Math.max(product.stock - existingCount, 0);

    if (gap === 0) {
      return NextResponse.json(
        { error: "Ya hay una unidad generada por cada unidad de stock actual" },
        { status: 400 }
      );
    }

    const requested = quantity === undefined ? gap : parseInt(quantity);
    if (!Number.isFinite(requested) || requested < 1) {
      return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });
    }
    if (requested > gap) {
      return NextResponse.json(
        { error: `Solo podés generar ${gap} unidad(es) más para alcanzar el stock actual (${product.stock})` },
        { status: 400 }
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const units = await createProductUnits(tx, productId, requested);
      await ensureWarrantyRolls(tx, productId, requested, {
        type: "UNIT_CREATION",
        unitIds: units.map((u) => u.id),
      });
      return units;
    });

    await logOperatorAction({ userId: session.user.id, action: "CREATE_UNITS", entityType: "PRODUCT", entityId: productId, description: `Creó ${created.length} unidad(es) de producto`, link: `/products/${productId}` });
    return NextResponse.json({ created: created.length, codes: created.map((u) => u.code) }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating units");
    return NextResponse.json({ error: "Error al crear unidades" }, { status: 500 });
  }
}
