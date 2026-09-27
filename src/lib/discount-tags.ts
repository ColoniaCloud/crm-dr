import { prisma } from "@/lib/prisma";
import { calcTagDiscount, describeTag, splitDiscount } from "@/lib/discount-tag-calc";

/**
 * Etiquetas de descuento: el descuento pactado con un contacto, aplicado solo
 * al crear una venta.
 *
 * ─── Por qué el cálculo vive del lado del servidor ─────────────────────────
 *
 * Hay dos puertas por las que nace una venta —`POST /api/sales` (el CRM) y
 * `POST /api/mobile/v1/sales` (el POS del vendedor en ruta, que es otra app en
 * otro deploy)— y las dos reciben el `discount` como un número del cliente. Si
 * el descuento de la etiqueta se calculara en el formulario, el POS tendría que
 * reimplementarlo y cualquiera podría mandar `discount: 0` y saltearlo.
 *
 * Así que el servidor lo calcula siempre, ignorando lo que el cliente diga del
 * descuento automático: lo que llega en el body es la **concesión a mano**, y
 * esto se suma aparte. Las dos pantallas lo muestran antes de confirmar usando
 * la misma aritmética (`src/lib/discount-tag-calc.ts`, sin Prisma), pero
 * mostrar no es decidir.
 *
 * ─── Dónde NO se aplica ────────────────────────────────────────────────────
 *
 * En los presupuestos, y por lo tanto tampoco al convertir un presupuesto en
 * venta. Un presupuesto ya lleva descuento por ítem cargado a mano y es un
 * precio que se le mostró al cliente: volver a descontarle la etiqueta encima
 * sería descontar dos veces y cambiar un número ya prometido.
 */

export { calcTagDiscount, describeTag } from "@/lib/discount-tag-calc";
export { DISCOUNT_TAG_TYPES } from "@/lib/discount-tag-calc";
export type { DiscountTagType, DiscountTagLike } from "@/lib/discount-tag-calc";

export interface ResolvedDiscount {
  /** Monto en pesos que pone la etiqueta. 0 si no hay etiqueta activa. */
  amount: number;
  /** Etiqueta aplicada, o null si el contacto no tiene ninguna activa. */
  tag: { id: string; code: string; name: string; type: string; value: number } | null;
  /** Texto para guardar en la venta: `"A — Mayorista (20%)"`. */
  label: string | null;
}

/**
 * La etiqueta de un contacto y lo que descuenta sobre `subtotal`.
 *
 * Read-only: llamar **antes** de abrir la transacción que crea la venta, igual
 * que `checkCredit()`.
 *
 * Una etiqueta desactivada (`active: false`) no se aplica. Desactivar es la vía
 * para dejar de usar una etiqueta sin desasignarla de los contactos que la
 * tienen: dejan de recibir el descuento, pero si se vuelve a activar lo
 * recuperan. Borrarla es lo otro (ver DELETE /api/discount-tags/[id]).
 */
export async function resolveContactDiscount(
  contactId: string,
  subtotal: number
): Promise<ResolvedDiscount> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { discountTag: true },
  });

  const tag = contact?.discountTag;
  if (!tag || !tag.active) return { amount: 0, tag: null, label: null };

  return {
    amount: calcTagDiscount(tag, subtotal),
    tag: {
      id: tag.id,
      code: tag.code,
      name: tag.name,
      type: tag.type,
      value: Number(tag.value),
    },
    label: describeTag(tag),
  };
}

export interface SaleDiscountBreakdown {
  /** Lo que se guarda en `Sale.discount`: etiqueta + mano, acotado al subtotal. */
  discount: number;
  /** Lo que se guarda en `Sale.tagDiscount`. */
  tagDiscount: number;
  /** La parte que efectivamente quedó del descuento cargado a mano. */
  manualDiscount: number;
  discountTagId: string | null;
  discountTagLabel: string | null;
}

/**
 * Descuento final de una venta: la etiqueta del contacto **más** lo que cargó a
 * mano quien vende. El reparto lo decide `splitDiscount()`, compartido con la UI.
 */
export async function resolveSaleDiscount(
  contactId: string,
  subtotal: number,
  manualDiscount: number
): Promise<SaleDiscountBreakdown> {
  const resolved = await resolveContactDiscount(contactId, subtotal);
  const split = splitDiscount(resolved.amount, manualDiscount, subtotal);

  return {
    ...split,
    discountTagId: resolved.tag?.id ?? null,
    discountTagLabel: split.tagDiscount > 0 ? resolved.label : null,
  };
}
