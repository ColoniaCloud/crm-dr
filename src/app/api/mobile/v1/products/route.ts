import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mobile/v1/products");

const SELECT = {
  id: true,
  name: true,
  sku: true,
  price: true,
  stock: true,
  imageUrl: true,
  category: true,
} as const;

// Prisma's Decimal serializes to a string via JSON.stringify — coerce to a
// plain number so the client (and the createSale zod schema) get a real number.
function serializeProduct<T extends { price: unknown }>(product: T) {
  return { ...product, price: Number(product.price) };
}

export function OPTIONS() {
  return mobileCorsPreflight();
}

export async function GET(request: Request) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    // Exact SKU lookup, used right after a QR/barcode scan.
    const sku = searchParams.get("sku")?.trim();

    if (sku) {
      const product = await prisma.product.findUnique({ where: { sku }, select: SELECT });
      return withMobileCors(
        NextResponse.json({ products: product ? [serializeProduct(product)] : [] })
      );
    }

    const products = await prisma.product.findMany({
      where: {
        active: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { sku: { contains: search } },
                { brand: { contains: search } },
              ],
            }
          : {}),
      },
      select: SELECT,
      orderBy: { name: "asc" },
      take: 50,
    });

    return withMobileCors(NextResponse.json({ products: products.map(serializeProduct) }));
  } catch (error) {
    log.error({ err: error }, "Error searching products");
    return withMobileCors(NextResponse.json({ error: "Error al buscar productos" }, { status: 500 }));
  }
}
