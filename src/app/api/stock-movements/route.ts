import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
const log = createLogger("api/stock-movements");

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const type = searchParams.get("type");

    const movements = await prisma.stockMovement.findMany({
      where: {
        ...(productId ? { productId } : {}),
        ...(type ? { type: type as "ENTRADA" | "SALIDA" | "AJUSTE" | "DEVOLUCION" } : {}),
      },
      include: {
        product: { select: { id: true, name: true, sku: true, category: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json(movements);
  } catch (error) {
    log.error({ err: error }, "Error fetching stock movements");
    return NextResponse.json({ error: "Error fetching stock movements" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { productId, type, quantity, reason } = body;

    if (!productId || !type || quantity === undefined) {
      return NextResponse.json({ error: "productId, type y quantity son requeridos" }, { status: 400 });
    }

    const qty = parseInt(String(quantity));
    if (isNaN(qty) || qty === 0) {
      return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error("Producto no encontrado");

      const stockBefore = product.stock;
      const delta = type === "SALIDA" ? -Math.abs(qty) : Math.abs(qty);
      const stockAfter = stockBefore + delta;

      if (stockAfter < 0) {
        throw new Error("Stock insuficiente");
      }

      await tx.product.update({
        where: { id: productId },
        data: { stock: stockAfter },
      });

      return tx.stockMovement.create({
        data: {
          productId,
          type,
          quantity: Math.abs(qty),
          stockBefore,
          stockAfter,
          referenceType: "ADJUSTMENT",
          reason,
          userId: session.user.id,
        },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          user: { select: { id: true, name: true } },
        },
      });
    });

    await logOperatorAction({ userId: session.user.id, action: "STOCK_MOVEMENT", entityType: "STOCK", entityId: result.id, description: `Movimiento de stock: ${type} x${Math.abs(qty)} de "${result.product.name}"` });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error creating stock movement";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
