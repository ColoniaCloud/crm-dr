/**
 * Cálculo puro de las etiquetas de descuento — **sin Prisma**, a propósito.
 *
 * El formulario de venta tiene que mostrar el descuento antes de confirmar, y es
 * un componente cliente: si importara `src/lib/discount-tags.ts` (que abre el
 * cliente de Prisma en el import) se arrastraría la base al bundle del
 * navegador. Así que la aritmética vive acá y los dos lados usan la misma, que
 * es el punto: que lo que el vendedor ve y lo que el servidor guarda salgan de
 * la misma función.
 *
 * Quien decide sigue siendo el servidor (`resolveSaleDiscount`). Esto solo sirve
 * para mostrar.
 */

export type DiscountTagType = "PERCENTAGE" | "FIXED";

/** Los dos tipos válidos, en un solo lugar (los usan el schema zod y la UI). */
export const DISCOUNT_TAG_TYPES = ["PERCENTAGE", "FIXED"] as const;

export interface DiscountTagLike {
  code: string;
  name: string;
  type: string;
  value: unknown; // Decimal de Prisma, string de la API o number
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Cuánto descuenta esta etiqueta sobre este subtotal.
 *
 * Acotado a `[0, subtotal]` a propósito: una etiqueta FIXED de $50.000 sobre una
 * venta de $30.000 descuenta $30.000 y no deja la venta en negativo. Un
 * porcentaje mayor a 100 queda igualmente acotado.
 */
export function calcTagDiscount(tag: DiscountTagLike, subtotal: number): number {
  const value = Number(tag.value);
  if (!Number.isFinite(value) || value <= 0 || subtotal <= 0) return 0;
  const raw = tag.type === "FIXED" ? value : subtotal * (value / 100);
  return round2(Math.min(Math.max(raw, 0), subtotal));
}

/** `"A — Mayorista (20%)"` / `"FIJO50 — Cuenta clave ($50.000)"`. */
export function describeTag(tag: DiscountTagLike): string {
  const value = Number(tag.value);
  const detail = tag.type === "FIXED" ? `$${value.toLocaleString("es-AR")}` : `${value}%`;
  return `${tag.code} — ${tag.name} (${detail})`;
}

/**
 * Cómo se reparte el descuento total entre la etiqueta y lo cargado a mano.
 *
 * Se **suman**, no se reemplazan: la etiqueta es el precio pactado de base y el
 * descuento manual es una concesión puntual encima. Si alguna vez se decide que
 * la etiqueta es un techo y no un piso, es cambiar la suma de acá — pero es una
 * decisión de negocio.
 *
 * El total nunca pasa el subtotal (una venta no puede quedar en negativo). Si la
 * suma se pasa, se recorta la parte manual y la etiqueta queda intacta: el
 * descuento pactado es el que no se negocia.
 */
export function splitDiscount(
  tagDiscount: number,
  manualDiscount: number,
  subtotal: number
): { discount: number; tagDiscount: number; manualDiscount: number } {
  const tag = round2(Math.min(Math.max(tagDiscount, 0), Math.max(subtotal, 0)));
  const manual = round2(Math.min(Math.max(manualDiscount, 0), Math.max(subtotal - tag, 0)));
  return { discount: round2(tag + manual), tagDiscount: tag, manualDiscount: manual };
}
