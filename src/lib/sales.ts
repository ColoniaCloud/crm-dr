import type { Prisma } from "@prisma/client";
import { linkRollToSaleItem, releaseRollForSaleItem } from "@/lib/warranty";

type Tx = Prisma.TransactionClient;

/**
 * Confirms a PENDING sale: validates stock, decrements it, records SALIDA
 * movements, and assigns warranty rolls (FIFO, or the buyer's own Punto de
 * Reventa stock first — see linkRollToSaleItem). This is now the ONLY place
 * stock actually moves for a sale — creating one (desktop, mobile POS, or
 * converted from a quote) no longer touches stock by itself; it sits as
 * PENDING until this runs.
 *
 * Throws (transaction rolls back, sale stays PENDING) if stock is short for
 * any item — that IS the backorder mechanism: no separate queue, the sale
 * just waits as PENDING until there's enough to confirm it. Also throws if
 * the sale isn't PENDING to begin with (can't re-confirm).
 */
export async function confirmSale(
  tx: Tx,
  saleId: string,
  userId: string,
  reasonSuffix = ""
): Promise<void> {
  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    include: { items: true },
  });
  if (!sale) throw new Error("Venta no encontrada");
  if (sale.status !== "PENDING") {
    throw new Error("Solo se puede confirmar una venta pendiente");
  }

  for (const item of sale.items) {
    const product = await tx.product.findUnique({ where: { id: item.productId } });
    if (!product || product.stock < item.quantity) {
      throw new Error(`Stock insuficiente para ${product?.name ?? item.productId}`);
    }
    const stockBefore = product.stock;
    const stockAfter = stockBefore - item.quantity;
    await tx.product.update({ where: { id: item.productId }, data: { stock: stockAfter } });
    await tx.stockMovement.create({
      data: {
        productId: item.productId,
        type: "SALIDA",
        quantity: item.quantity,
        stockBefore,
        stockAfter,
        referenceId: sale.id,
        referenceType: "SALE",
        reason: `Venta #${sale.number}${reasonSuffix}`,
        userId,
      },
    });
  }

  for (const item of sale.items) {
    await linkRollToSaleItem(tx, item.id, item.productId, item.productUnitId, sale.contactId);
  }

  await tx.sale.update({ where: { id: saleId }, data: { status: "CONFIRMED" } });
}

/**
 * Undoes confirmSale's stock/roll effects — used by CANCELLED and DELETE.
 * No-op if the sale never made it past PENDING: nothing was ever
 * decremented, so restoring it anyway would inflate stock that was never
 * actually removed.
 */
export async function restoreSaleStock(
  tx: Tx,
  saleId: string,
  userId: string,
  reason: string
): Promise<void> {
  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    include: { items: true },
  });
  if (!sale || sale.status === "PENDING") return;

  for (const item of sale.items) {
    const product = await tx.product.findUnique({ where: { id: item.productId } });
    if (!product) continue;
    const stockBefore = product.stock;
    const stockAfter = stockBefore + item.quantity;
    await tx.product.update({ where: { id: item.productId }, data: { stock: stockAfter } });
    await tx.stockMovement.create({
      data: {
        productId: item.productId,
        type: "DEVOLUCION",
        quantity: item.quantity,
        stockBefore,
        stockAfter,
        referenceId: saleId,
        referenceType: "SALE",
        reason,
        userId,
      },
    });
  }

  for (const item of sale.items) {
    await releaseRollForSaleItem(tx, item.id);
  }
}
