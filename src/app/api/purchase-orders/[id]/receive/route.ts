import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { createWarrantyLot } from "@/lib/warranty";
const log = createLogger("api/purchase-orders/[id]/receive");

// POST /api/purchase-orders/[id]/receive
// Marks order as RECEIVED, updates product stock and cost, creates stock movements
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const { id } = await params;

    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        importCosts: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }
    if (order.status === "RECEIVED") {
      return NextResponse.json({ error: "Esta orden ya fue recibida" }, { status: 400 });
    }

    // Calculate total import costs and distribute pro-rata by FOB value
    const totalImportCostsARS = order.importCosts.reduce(
      (sum, c) => sum + Number(c.amountARS),
      0
    );
    const totalFOB = order.items.reduce(
      (sum, item) => sum + Number(item.costFOB) * item.quantity,
      0
    );

    await prisma.$transaction(async (tx) => {
      // Update order status
      await tx.purchaseOrder.update({
        where: { id },
        data: { status: "RECEIVED", receivedDate: new Date() },
      });

      for (const item of order.items) {
        const stockBefore = item.product.stock;
        const stockAfter = stockBefore + item.quantity;

        // Calculate landed cost per unit (FOB + pro-rata import costs)
        const itemFOBTotal = Number(item.costFOB) * item.quantity;
        const proRataFactor = totalFOB > 0 ? itemFOBTotal / totalFOB : 0;
        const importCostShare = totalImportCostsARS * proRataFactor;
        const exchangeRate = order.exchangeRate ? Number(order.exchangeRate) : 1;
        const costLandedPerUnit =
          (Number(item.costFOB) * exchangeRate + importCostShare / item.quantity);

        // Update purchase order item with landed cost
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { costLanded: costLandedPerUnit },
        });

        // Update product stock and cost
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: stockAfter,
            cost: costLandedPerUnit,
          },
        });

        // Create stock movement
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: "ENTRADA",
            quantity: item.quantity,
            stockBefore,
            stockAfter,
            referenceId: id,
            referenceType: "PURCHASE_ORDER",
            reason: `Recepción OC #${order.number}`,
            userId: session.user.id,
          },
        });
      }
    });

    // Create warranty lots for products that have a WarrantyConfig
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await createWarrantyLot(tx, id, item.productId, item.quantity);
      }
    });

    const updated = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: { include: { product: true } },
        importCosts: true,
      },
    });

    await logOperatorAction({ userId: session.user.id, action: "RECEIVE_PURCHASE_ORDER", entityType: "PURCHASE_ORDER", entityId: id, description: `Recibió OC #${order.number} (${order.items.length} productos)`, link: `/purchase-orders/${id}` });
    return NextResponse.json(updated);
  } catch (error) {
    log.error({ err: error }, "Error receiving purchase order");
    return NextResponse.json({ error: "Error al recibir la orden" }, { status: 500 });
  }
}
