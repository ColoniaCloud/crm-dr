import { prisma } from "@/lib/prisma";

/**
 * Actualización de precios de venta desde un CSV, cruzando por SKU.
 *
 * Se hace en dos pasos: el asistente arma la vista previa con
 * `buildPricePreview()` y el botón de confirmar manda los cambios a
 * `POST /api/products/prices`, que los aplica con `applyPriceChanges()`.
 * Cada cambio viaja con el precio que tenía al armarse la vista previa: si
 * alguien lo modificó en el medio, ese producto no se pisa.
 */

/** Variación (en %) a partir de la cual la vista previa marca el cambio para revisar. */
const BIG_CHANGE_PCT = 50;

export type PriceChange = {
  productId: string;
  sku: string;
  name: string;
  oldPrice: number;
  newPrice: number;
};

export type PricePreview = {
  changes: (PriceChange & { warning: string | null })[];
  unchanged: number;
  /** SKU del CSV que no están en el CRM. */
  notFound: string[];
  /** Filas con SKU pero sin un precio legible. */
  invalidPrice: { sku: string; value: string }[];
  /** SKU repetidos en el CSV con precios distintos: no se tocan. */
  conflicts: string[];
};

/**
 * Lee un precio escrito a mano o exportado de una planilla: "195000",
 * "$ 195.000", "195.000,50", "195,000.50". Devuelve null si no es un número
 * mayor a cero.
 */
export function parsePrice(raw: string): number | null {
  let s = (raw || "").replace(/ARS|USD|U\$S/gi, "").replace(/[$\s]/g, "");
  if (!s) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Con los dos separadores, el último es el decimal.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "195.000" es ciento noventa y cinco mil, no 195.
    s = s.replace(/\./g, "");
  }

  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function buildPricePreview(
  rows: Record<string, string>[],
  skuColumn: string,
  priceColumn: string,
): Promise<PricePreview> {
  // Las filas sin SKU (títulos de sección, renglones vacíos) se ignoran.
  const fromCsv = new Map<string, { sku: string; prices: Set<number> }>();
  const invalidPrice: PricePreview["invalidPrice"] = [];

  for (const row of rows) {
    const sku = (row[skuColumn] || "").trim();
    if (!sku) continue;
    const rawPrice = (row[priceColumn] || "").trim();
    const price = parsePrice(rawPrice);
    if (price === null) {
      if (rawPrice) invalidPrice.push({ sku, value: rawPrice });
      continue;
    }
    const key = sku.toUpperCase();
    const entry = fromCsv.get(key) ?? { sku, prices: new Set<number>() };
    entry.prices.add(price);
    fromCsv.set(key, entry);
  }

  const products = await prisma.product.findMany({
    where: { sku: { not: null } },
    select: { id: true, sku: true, name: true, price: true, active: true },
  });
  const bySku = new Map(products.map((p) => [p.sku!.trim().toUpperCase(), p]));

  const preview: PricePreview = { changes: [], unchanged: 0, notFound: [], invalidPrice, conflicts: [] };

  for (const [key, { sku, prices }] of fromCsv) {
    if (prices.size > 1) {
      preview.conflicts.push(sku);
      continue;
    }
    const product = bySku.get(key);
    if (!product) {
      preview.notFound.push(sku);
      continue;
    }
    const newPrice = [...prices][0];
    const oldPrice = Number(product.price);
    if (oldPrice === newPrice) {
      preview.unchanged++;
      continue;
    }
    const pct = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : null;
    const warnings: string[] = [];
    if (pct !== null && Math.abs(pct) >= BIG_CHANGE_PCT) warnings.push(`variación de ${Math.round(pct)}%`);
    if (!product.active) warnings.push("producto inactivo");
    preview.changes.push({
      productId: product.id,
      sku: product.sku!,
      name: product.name,
      oldPrice,
      newPrice,
      warning: warnings.length ? warnings.join(", ") : null,
    });
  }

  preview.changes.sort((a, b) => a.sku.localeCompare(b.sku));
  return preview;
}

export async function applyPriceChanges(changes: PriceChange[]): Promise<{ updated: PriceChange[]; skipped: PriceChange[] }> {
  const updated: PriceChange[] = [];
  const skipped: PriceChange[] = [];

  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      // Solo si el precio sigue siendo el de la vista previa.
      const res = await tx.product.updateMany({
        where: { id: change.productId, price: change.oldPrice },
        data: { price: change.newPrice },
      });
      (res.count > 0 ? updated : skipped).push(change);
    }
  });

  return { updated, skipped };
}
