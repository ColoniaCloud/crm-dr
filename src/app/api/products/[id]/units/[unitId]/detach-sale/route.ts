import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { logOperatorAction } from "@/lib/notifications";
import { calcTax } from "@/lib/utils";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/products/[id]/units/[unitId]/detach-sale");

// Detaches a traced unit (rollo) from the sale it's currently in, restoring
// the stock that sale consumed, so it can be reassigned to a different sale.
// Blocked once the sale is fully paid or a warranty was already activated on
// this unit's roll — at that point the unit is truly gone, not reassignable.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; unitId: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id: productId, unitId } = await params;

    const unit = await prisma.productUnit.findUnique({
      where: { id: unitId },
      select: {
        code: true,
        saleItem: {
          select: {
            id: true,
            quantity: true,
            total: true,
            productId: true,
            sale: {
              select: {
                id: true,
                number: true,
                subtotal: true,
                discount: true,
                total: true,
                requiresFactura: true,
                payments: { select: { amount: true } },
                items: { select: { id: true } },
              },
            },
          },
        },
        warrantyRoll: {
          select: { installations: { select: { activatedAt: true } } },
        },
      },
    });

    if (!unit) {
      return NextResponse.json({ error: "Unidad no encontrada" }, { status: 404 });
    }
    if (!unit.saleItem) {
      return NextResponse.json({ error: "Esta unidad no está vendida" }, { status: 400 });
    }

    const { saleItem } = unit;
    const { sale } = saleItem;
    const paidAmount = sale.payments.reduce((s, p) => s + Number(p.amount), 0);
    const isPaidComplete = paidAmount >= Number(sale.total);
    const hasActivatedWarranty = unit.warrantyRoll?.installations.some((i) => i.activatedAt !== null) ?? false;

    if (isPaidComplete) {
      return NextResponse.json(
        { error: "No se puede reasignar: la venta ya está completamente pagada" },
        { status: 403 }
      );
    }
    if (hasActivatedWarranty) {
      return NextResponse.json(
        { error: "No se puede reasignar: ya se activó una garantía sobre este rollo" },
        { status: 403 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Restore the stock this item consumed
      const product = await tx.product.findUnique({ where: { id: saleItem.productId } });
      if (product) {
        const stockBefore = product.stock;
        const stockAfter = stockBefore + saleItem.quantity;
        await tx.product.update({ where: { id: product.id }, data: { stock: stockAfter } });
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            type: "DEVOLUCION",
            quantity: saleItem.quantity,
            stockBefore,
            stockAfter,
            referenceId: sale.id,
            referenceType: "SALE",
            reason: `Rollo ${unit.code} reasignado (venta #${sale.number})`,
            userId: session.user.id,
          },
        });
      }

      await tx.saleItem.delete({ where: { id: saleItem.id } });

      const remainingItems = sale.items.length - 1;
      if (remainingItems <= 0) {
        await tx.sale.update({ where: { id: sale.id }, data: { status: "CANCELLED" } });
      } else {
        const newSubtotal = Number(sale.subtotal) - Number(saleItem.total);
        const newTax = sale.requiresFactura ? calcTax(newSubtotal) : 0;
        const newTotal = newSubtotal - Number(sale.discount) + newTax;
        await tx.sale.update({
          where: { id: sale.id },
          data: { subtotal: newSubtotal, tax: newTax, total: newTotal },
        });
      }
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "DETACH_SALE_UNIT",
      entityType: "PRODUCT_UNIT",
      entityId: unitId,
      description: `Reasignó el rollo ${unit.code}, quitándolo de la venta #${sale.number}`,
      link: `/products/${productId}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error detaching sale from unit");
    return NextResponse.json({ error: "Error al reasignar la unidad" }, { status: 500 });
  }
}
