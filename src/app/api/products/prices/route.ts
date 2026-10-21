import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { applyPriceChanges, type PriceChange } from "@/lib/price-import";

const log = createLogger("api/products/prices");

/**
 * Aplica la actualización de precios de venta que el asistente mostró en la
 * vista previa (ver lib/price-import.ts). Un producto cuyo precio cambió desde
 * la vista previa se saltea en lugar de pisarse.
 */
export async function POST(request: Request) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { changes } = (await request.json()) as { changes?: PriceChange[] };

    const valid =
      Array.isArray(changes) &&
      changes.length > 0 &&
      changes.every(
        (c) =>
          typeof c.productId === "string" &&
          Number.isFinite(c.oldPrice) &&
          Number.isFinite(c.newPrice) &&
          c.newPrice > 0,
      );
    if (!valid) {
      return NextResponse.json({ error: "Cambios de precio inválidos" }, { status: 400 });
    }

    const { updated, skipped } = await applyPriceChanges(changes);

    for (const c of updated) {
      await logOperatorAction({
        userId: session.user.id,
        action: "UPDATE_PRODUCT",
        entityType: "PRODUCT",
        entityId: c.productId,
        description: `Actualizó el precio de "${c.name}" (${c.sku}) de $${c.oldPrice.toLocaleString("es-AR")} a $${c.newPrice.toLocaleString("es-AR")} desde un CSV`,
        link: `/products/${c.productId}`,
      });
    }

    return NextResponse.json({ updated: updated.length, skipped: skipped.map((c) => c.sku) });
  } catch (error) {
    log.error({ err: error }, "Error actualizando precios");
    return NextResponse.json({ error: "Error actualizando precios" }, { status: 500 });
  }
}
