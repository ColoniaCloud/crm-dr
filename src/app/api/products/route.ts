import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
const log = createLogger("api/products");

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const subcategory = searchParams.get("subcategory");

    const where: Record<string, unknown> = {};

    const active = searchParams.get("active");
    if (active === "false") where.active = false;
    else if (active === "true" || active === null) where.active = true;

    if (category) where.category = category;
    if (subcategory) where.subcategory = subcategory;

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
        { brand: { contains: search } },
        { sku: { contains: search } },
        { subcategory: { contains: search } },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        discounts: true,
        _count: { select: { units: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(products);
  } catch (error) {
    log.error({ err: error }, "Error fetching products");
    return NextResponse.json({ error: "Error fetching products" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { discounts, priceTiers, ...productData } = body;

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data: productData });

      if (discounts && discounts.length > 0) {
        await tx.productDiscount.createMany({
          data: discounts.map((d: { type: string; value: number; label?: string }) => ({
            productId: created.id,
            type: d.type,
            value: d.value,
            label: d.label ?? null,
          })),
        });
      }

      if (priceTiers && priceTiers.length > 0) {
        await tx.priceTier.createMany({
          data: priceTiers.map((t: { tierType: string; minQty: number; price: number }) => ({
            productId: created.id,
            tierType: t.tierType,
            minQty: t.minQty,
            price: t.price,
          })),
        });
      }

      return tx.product.findUnique({
        where: { id: created.id },
        include: { discounts: true, priceTiers: { orderBy: { minQty: "asc" } }, _count: { select: { units: true } } },
      });
    });

    await logOperatorAction({ userId: session.user.id, action: "CREATE_PRODUCT", entityType: "PRODUCT", entityId: product?.id, description: `Creó producto "${productData.name}"`, link: `/products/${product?.id}` });
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating product");
    return NextResponse.json({ error: "Error creating product" }, { status: 500 });
  }
}
