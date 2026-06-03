import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logOperatorAction } from "@/lib/notifications";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        discounts: true,
        priceTiers: { orderBy: { minQty: "asc" } },
        units: {
          include: { assignedTo: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "Error al obtener producto" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const { discounts, priceTiers, ...productData } = body;

    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id }, data: productData });

      if (discounts !== undefined) {
        await tx.productDiscount.deleteMany({ where: { productId: id } });
        if (discounts.length > 0) {
          await tx.productDiscount.createMany({
            data: discounts.map((d: { type: string; value: number; label?: string }) => ({
              productId: id,
              type: d.type,
              value: d.value,
              label: d.label ?? null,
            })),
          });
        }
      }

      if (priceTiers !== undefined) {
        await tx.priceTier.deleteMany({ where: { productId: id } });
        if (priceTiers.length > 0) {
          await tx.priceTier.createMany({
            data: priceTiers.map((t: { tierType: string; minQty: number; price: number }) => ({
              productId: id,
              tierType: t.tierType,
              minQty: t.minQty,
              price: t.price,
            })),
          });
        }
      }

      return updated;
    });

    await logOperatorAction({ userId: session.user.id, action: "UPDATE_PRODUCT", entityType: "PRODUCT", entityId: id, description: `Actualizó producto "${product.name}"`, link: `/products/${id}` });
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "Error al actualizar producto" }, { status: 500 });
  }
}
