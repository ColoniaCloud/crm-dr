import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { getContactProductTags, type TagResumen } from "@/lib/discount-tags";
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

/**
 * Con `?contactId=`, cada producto viaja con **la etiqueta de descuento que le
 * corresponde a ese cliente en ese producto** — ya resuelta.
 *
 * Resuelta acá y no en el POS a propósito. La precedencia tiene una regla que no
 * es obvia (un contacto con acuerdos por producto deja de usar su etiqueta
 * general para todo, ver resolveLineTag en src/lib/discount-tags.ts), y si el POS
 * la reimplementara terminaría cantándole al taller un total distinto del que el
 * CRM registra. El POS no sabe nada de acuerdos: recibe la etiqueta de cada
 * producto y la aplica.
 *
 * Sin `contactId` devuelve el catálogo pelado, que es lo que hacía siempre — la
 * búsqueda por SKU del escáner puede pasar antes de elegir el cliente.
 */
async function conEtiquetas<T extends { id: string; price: unknown }>(
  products: T[],
  contactId: string | null
): Promise<(T & { price: number; discountTag?: TagResumen | null })[]> {
  const serialized = products.map(serializeProduct);
  if (!contactId || serialized.length === 0) return serialized;

  const tags = await getContactProductTags(
    contactId,
    serialized.map((p) => p.id)
  );
  return serialized.map((p) => ({ ...p, discountTag: tags[p.id] ?? null }));
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
    // El cliente de la venta en curso, si ya se eligió. Ver conEtiquetas().
    const contactId = searchParams.get("contactId")?.trim() || null;

    if (sku) {
      // `active` tambien aca: el listado filtra los dados de baja, pero el
      // lookup por SKU no lo hacia, y en la ruta el escaneo es la via
      // principal — un producto discontinuado con stock remanente se vendia.
      const product = await prisma.product.findFirst({
        where: { sku, active: true },
        select: SELECT,
      });
      return withMobileCors(
        NextResponse.json({ products: await conEtiquetas(product ? [product] : [], contactId) })
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

    return withMobileCors(NextResponse.json({ products: await conEtiquetas(products, contactId) }));
  } catch (error) {
    log.error({ err: error }, "Error searching products");
    return withMobileCors(NextResponse.json({ error: "Error al buscar productos" }, { status: 500 }));
  }
}
