import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
const log = createLogger("api/purchase-orders");

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const role = session.user.role as string;
    if (role !== "ADMIN" && role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const orders = await prisma.purchaseOrder.findMany({
      where: status ? { status: status as "DRAFT" | "SENT" | "CONFIRMED" | "RECEIVED" } : undefined,
      include: {
        supplier: { select: { id: true, name: true, currency: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, category: true } },
          },
        },
        importCosts: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json(orders);
  } catch (error) {
    log.error({ err: error }, "Error fetching purchase orders");
    return NextResponse.json({ error: "Error fetching purchase orders" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const role = session.user.role as string;
    if (role !== "ADMIN" && role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
    }

    const body = await request.json();
    const { supplierId, currency, exchangeRate, orderDate, expectedDate, notes, items } = body;

    if (!supplierId) {
      return NextResponse.json({ error: "El proveedor es requerido" }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Debe incluir al menos un producto" }, { status: 400 });
    }

    const order = await prisma.purchaseOrder.create({
      data: {
        supplierId,
        currency: currency ?? "USD",
        exchangeRate: exchangeRate ? parseFloat(exchangeRate) : null,
        orderDate: orderDate ? new Date(orderDate) : new Date(),
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        notes,
        items: {
          create: items.map((item: { productId: string; quantity: number; costFOB: number; notes?: string }) => {
            const qty = parseInt(String(item.quantity));
            const cost = parseFloat(String(item.costFOB));
            if (isNaN(qty) || qty <= 0) throw new Error("Cantidad inválida");
            if (isNaN(cost) || cost < 0) throw new Error("Costo inválido");
            return {
              productId: item.productId,
              quantity: qty,
              costFOB: cost,
              notes: item.notes,
            };
          }),
        },
      },
      include: {
        supplier: true,
        items: { include: { product: true } },
      },
    });

    await logOperatorAction({ userId: session.user.id, action: "CREATE_PURCHASE_ORDER", entityType: "PURCHASE_ORDER", entityId: order.id, description: `Creó orden de compra #${order.number} para "${order.supplier.name}"`, link: `/purchase-orders/${order.id}` });
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating purchase order");
    return NextResponse.json({ error: "Error creating purchase order" }, { status: 500 });
  }
}
