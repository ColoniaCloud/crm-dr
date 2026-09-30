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

// ─── Descuento por línea ────────────────────────────────────────────────────
//
// Desde octubre 2026 la etiqueta se aplica **por línea de la venta** y no sobre
// el subtotal. El motivo es un caso que el modelo viejo no podía expresar: a un
// revendedor se le pactó 16,66% en una lámina y nada en las otras dos de la
// misma venta.
//
// `calcTagDiscount` de arriba se reusa tal cual — el "subtotal" que recibe pasa
// a ser el total de una línea, y el acotado a `[0, monto]` sigue siendo lo que
// se quiere: una etiqueta FIXED más grande que la línea descuenta la línea
// entera y no la deja en negativo.
//
// ─── Por qué esto NO prorratea nada ─────────────────────────────────────────
//
// Una versión anterior del diseño tenía **una** etiqueta por contacto estirada
// sobre todas las líneas, y ahí sí había que prorratear: una FIXED de $50.000
// aplicada "a cada línea" son $150.000 en tres líneas, que es plata regalada.
//
// Con una etiqueta elegida por línea eso desaparece: cada línea calcula el suyo
// contra su propio total. Y la invariante que sostiene el desglose sale gratis,
// sin restos de redondeo que haya que asignarle a alguna línea:
//
//     Σ SaleItem.tagDiscount === Sale.tagDiscount     (al centavo, siempre)

/** Una línea con la etiqueta que le corresponde, ya resuelta. */
export interface LineaConEtiqueta {
  /** Total BRUTO de la línea: quantity × unitPrice. */
  total: number;
  /** La etiqueta de esta línea, o null si no lleva descuento. */
  tag: DiscountTagLike | null;
}

/** Lo que una línea descuenta, y con qué. */
export interface DescuentoDeLinea {
  tagDiscount: number;
  /** Para guardar en `SaleItem.discountTagLabel`. Null si la línea no descontó. */
  label: string | null;
}

/** Cuánto descuenta una línea. `calcTagDiscount` sobre su propio total. */
export function calcItemTagDiscount(linea: LineaConEtiqueta): DescuentoDeLinea {
  if (!linea.tag) return { tagDiscount: 0, label: null };
  const tagDiscount = calcTagDiscount(linea.tag, linea.total);
  // Sin descuento efectivo no se guarda la etiqueta: una línea con
  // `discountTagLabel` y `tagDiscount: 0` haría que el desglose muestre una
  // etiqueta que no hizo nada, y quien lo lea va a buscar el error donde no está.
  return { tagDiscount, label: tagDiscount > 0 ? describeTag(linea.tag) : null };
}

/** El descuento de etiquetas de toda la venta: la suma de sus líneas. */
export function calcLinesTagDiscount(lineas: LineaConEtiqueta[]): number {
  return round2(
    lineas.reduce((suma, linea) => suma + calcItemTagDiscount(linea).tagDiscount, 0)
  );
}
