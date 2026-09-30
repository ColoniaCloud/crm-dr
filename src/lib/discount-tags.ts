import { prisma } from "@/lib/prisma";
import {
  calcItemTagDiscount,
  describeTag,
  round2,
  splitDiscount,
  type DiscountTagLike,
  type LineaConEtiqueta,
} from "@/lib/discount-tag-calc";

/**
 * Etiquetas de descuento: el descuento pactado con un contacto, aplicado solo
 * al crear una venta.
 *
 * ─── Por qué el cálculo vive del lado del servidor ─────────────────────────
 *
 * Hay dos puertas por las que nace una venta —`POST /api/sales` (el CRM) y
 * `POST /api/mobile/v1/sales` (el POS del vendedor en ruta, que es otra app en
 * otro deploy)— y las dos reciben los precios como números del cliente. Si el
 * descuento de la etiqueta se calculara en el formulario, el POS tendría que
 * reimplementarlo y cualquiera podría mandar `discount: 0` y saltearlo.
 *
 * Así que el servidor lo calcula siempre, ignorando lo que el cliente diga del
 * descuento automático: lo que llega en el body es la **concesión a mano**, y
 * esto se suma aparte. Las dos pantallas lo muestran antes de confirmar usando
 * la misma aritmética (`src/lib/discount-tag-calc.ts`, sin Prisma), pero
 * mostrar no es decidir.
 *
 * ─── Desde octubre 2026: por línea, no sobre el subtotal ────────────────────
 *
 * El caso que forzó el cambio: a un revendedor se le pactó 16,66% en una lámina
 * y **nada** en las otras dos de la misma venta. Con una sola etiqueta por
 * contacto aplicada al subtotal eso es inexpresable.
 *
 * Ahora cada línea lleva su etiqueta, que sale de `ContactProductDiscount`
 * (contacto × producto × etiqueta). Ver `resolveLineTag` para la precedencia
 * completa, que tiene una regla que no es obvia y está documentada ahí.
 *
 * ─── Dónde NO se aplica ────────────────────────────────────────────────────
 *
 * En los presupuestos, y por lo tanto tampoco al convertir un presupuesto en
 * venta. Un presupuesto ya lleva descuento por ítem cargado a mano y es un
 * precio que se le mostró al cliente: volver a descontarle la etiqueta encima
 * sería descontar dos veces y cambiar un número ya prometido.
 */

export { calcTagDiscount, describeTag, calcItemTagDiscount } from "@/lib/discount-tag-calc";
export { DISCOUNT_TAG_TYPES } from "@/lib/discount-tag-calc";
export type { DiscountTagType, DiscountTagLike } from "@/lib/discount-tag-calc";

/** Los campos de una etiqueta que viajan a la venta y a las pantallas. */
export interface TagResumen {
  id: string;
  code: string;
  name: string;
  type: string;
  value: number;
}

function resumir(tag: {
  id: string;
  code: string;
  name: string;
  type: string;
  value: unknown;
}): TagResumen {
  return {
    id: tag.id,
    code: tag.code,
    name: tag.name,
    type: tag.type,
    value: Number(tag.value),
  };
}

/**
 * Lo que el contacto tiene pactado: sus acuerdos por producto y su etiqueta
 * general.
 *
 * `modoAcuerdos` es la bandera que decide todo lo demás — ver `resolveLineTag`.
 */
export interface DescuentosDelContacto {
  /** true si el contacto tiene al menos un acuerdo por producto **activo**. */
  modoAcuerdos: boolean;
  /** productId → etiqueta pactada para ese producto. Solo etiquetas activas. */
  porProducto: Map<string, TagResumen>;
  /** La etiqueta general del contacto, si tiene y está activa. */
  general: TagResumen | null;
}

/**
 * Los descuentos pactados de un contacto, en una sola consulta.
 *
 * Read-only: llamar **antes** de abrir la transacción que crea la venta, igual
 * que `checkCredit()`.
 *
 * Una etiqueta desactivada (`active: false`) no cuenta, ni como acuerdo ni como
 * general. Desactivar sigue siendo la vía para dejar de usar una etiqueta sin
 * desasignarla de los contactos que la tienen: dejan de recibir el descuento,
 * pero si se vuelve a activar lo recuperan.
 *
 * **Y por eso `modoAcuerdos` mira solo los acuerdos con etiqueta activa:** si
 * alguien desactiva la única etiqueta que un contacto tenía pactada, ese
 * contacto vuelve a su etiqueta general en vez de quedarse sin ningún descuento.
 * Lo contrario dejaría un contacto en un limbo silencioso — con acuerdos que no
 * descuentan y una etiqueta general que tampoco se aplica.
 */
export async function getContactDiscounts(
  contactId: string
): Promise<DescuentosDelContacto> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      discountTag: true,
      productDiscounts: {
        select: { productId: true, discountTag: true },
      },
    },
  });

  const porProducto = new Map<string, TagResumen>();
  for (const acuerdo of contact?.productDiscounts ?? []) {
    if (acuerdo.discountTag.active) {
      porProducto.set(acuerdo.productId, resumir(acuerdo.discountTag));
    }
  }

  const general =
    contact?.discountTag && contact.discountTag.active
      ? resumir(contact.discountTag)
      : null;

  return { modoAcuerdos: porProducto.size > 0, porProducto, general };
}

/**
 * Qué etiqueta le corresponde a una línea.
 *
 * ```
 * 1. ¿Vino una etiqueta elegida a mano?        → esa.  (solo ADMIN/SUPERADMIN)
 * 2. ¿Hay acuerdo para (contacto, producto)?   → esa.
 * 3. ¿El contacto está en modo acuerdos?       → SIN DESCUENTO.
 * 4. ¿Tiene etiqueta general?                  → esa.
 * 5. Sin descuento.
 * ```
 *
 * **El paso 3 es la regla que no es obvia, y es a propósito.** Un contacto con
 * al menos un acuerdo por producto **no usa nunca** su etiqueta general, ni en
 * los productos sin acuerdo. Si fuera cascada, cargarle el acuerdo de una lámina
 * al revendedor del ejemplo le dejaría el descuento general sobre las otras dos
 * — justo lo contrario de lo pactado. La cascada obliga a acordarse de vaciar la
 * etiqueta general; esto no se puede olvidar.
 *
 * La etiqueta general **no se borra** al cargar el primer acuerdo: queda
 * guardada y vuelve a aplicarse si se quitan todos los acuerdos. La ficha del
 * contacto avisa antes de guardar el primero, porque es la operación que cambia
 * precios sin que se note.
 *
 * **El paso 4 es lo que hace que nada cambie el día del deploy:** ningún
 * contacto tiene acuerdos todavía, así que todas las líneas caen acá y reciben
 * la etiqueta general — y como el porcentaje es el mismo en todas, el total es
 * idéntico al que daba el cálculo sobre el subtotal.
 */
function resolveLineTag(
  descuentos: DescuentosDelContacto,
  productId: string,
  override: TagResumen | null
): TagResumen | null {
  if (override) return override;
  const acuerdo = descuentos.porProducto.get(productId);
  if (acuerdo) return acuerdo;
  if (descuentos.modoAcuerdos) return null;
  return descuentos.general;
}

/** Una línea tal como llega del formulario o del POS. */
export interface SaleLineInput {
  productId: string;
  /** Total BRUTO de la línea: quantity × unitPrice. */
  total: number;
  /**
   * Etiqueta elegida a mano para esta línea. `undefined` = no se eligió nada y
   * manda el acuerdo; `null` = se eligió explícitamente "Sin descuento".
   */
  discountTagId?: string | null;
}

/** Lo que se guarda en cada `SaleItem`. */
export interface ResolvedLineDiscount {
  discountTagId: string | null;
  discountTagLabel: string | null;
  tagDiscount: number;
}

export interface SaleDiscountBreakdown {
  /** Lo que se guarda en `Sale.discount`: etiquetas + mano, acotado al subtotal. */
  discount: number;
  /** Lo que se guarda en `Sale.tagDiscount`. Es `Σ lines[].tagDiscount`. */
  tagDiscount: number;
  /** La parte que efectivamente quedó del descuento cargado a mano. */
  manualDiscount: number;
  /** Resumen para `Sale` — ver `resumirEtiquetas`. */
  discountTagId: string | null;
  discountTagLabel: string | null;
  /** Una entrada por línea, en el mismo orden que llegaron. */
  lines: ResolvedLineDiscount[];
}

export type SaleDiscountResult =
  | ({ ok: true } & SaleDiscountBreakdown)
  | { ok: false; error: string };

/**
 * `Sale.discountTagId` / `discountTagLabel` fueron pensados para una venta con
 * **una** etiqueta, y los lee el ticket del POS (`mobile-sale.ts`) y el detalle
 * de la venta. Con varias etiquetas en una venta hay que decidir qué dicen.
 *
 *   - Todas las líneas con descuento comparten una etiqueta → esa y su texto.
 *     Es el caso de hoy, y se sigue mostrando igual que siempre.
 *   - Varias distintas → `null` y "N etiquetas por ítem". Mostrar la primera
 *     que aparezca sería mentir sobre las otras.
 *   - Ninguna → null y null.
 *
 * El desglose real vive en las líneas, que es donde se lo va a mirar.
 */
function resumirEtiquetas(
  lines: ResolvedLineDiscount[]
): { discountTagId: string | null; discountTagLabel: string | null } {
  const conDescuento = lines.filter((l) => l.discountTagId && l.tagDiscount > 0);
  const distintas = new Set(conDescuento.map((l) => l.discountTagId!));

  if (distintas.size === 0) return { discountTagId: null, discountTagLabel: null };
  if (distintas.size === 1) {
    return {
      discountTagId: conDescuento[0].discountTagId,
      discountTagLabel: conDescuento[0].discountTagLabel,
    };
  }
  return {
    discountTagId: null,
    discountTagLabel: `${distintas.size} etiquetas por ítem`,
  };
}

/**
 * Las etiquetas que el cliente eligió a mano, validadas contra la base.
 *
 * Se validan y no se confían: un `discountTagId` inventado, borrado o
 * desactivado no descuenta nada. Devuelve null si alguno no existe o no está
 * activo, para que quien llama corte con un mensaje en vez de vender con un
 * descuento fantasma.
 */
async function cargarOverrides(
  lines: SaleLineInput[]
): Promise<Map<string, TagResumen> | null> {
  const ids = [...new Set(lines.map((l) => l.discountTagId).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();

  const tags = await prisma.discountTag.findMany({
    where: { id: { in: ids }, active: true },
  });
  if (tags.length !== ids.length) return null;

  return new Map(tags.map((t) => [t.id, resumir(t)]));
}

/**
 * El descuento final de una venta, línea por línea **más** lo que cargó a mano
 * quien vende.
 *
 * `allowOverride` es el permiso para elegir la etiqueta de una línea a mano:
 * solo `ADMIN` y `SUPERADMIN`. En el CRM sale gratis —`POST /api/sales` ya es
 * ADMIN+ y nadie por debajo llega a ese formulario— pero
 * `POST /api/mobile/v1/sales` acepta `OPERATOR`, que es el vendedor en ruta.
 *
 * **Y ahí se rechaza, no se ignora.** El POS calcula el total localmente con
 * `money.ts` para cantárselo al comprador antes de confirmar: si el servidor
 * ignorara la etiqueta y usara otra, el vendedor cantaría un precio y quedaría
 * anotado otro. Es el mismo criterio que el chequeo de precios de esa ruta —
 * cortar con un mensaje que el vendedor pueda leer.
 */
export async function resolveSaleDiscount(
  contactId: string,
  lines: SaleLineInput[],
  manualDiscount: number,
  opts: { allowOverride: boolean }
): Promise<SaleDiscountResult> {
  const descuentos = await getContactDiscounts(contactId);

  const overrides = await cargarOverrides(lines);
  if (!overrides) {
    return {
      ok: false,
      error: "Una de las etiquetas de descuento elegidas no existe o está desactivada",
    };
  }

  const resolved: ResolvedLineDiscount[] = [];
  for (const line of lines) {
    const override = line.discountTagId ? overrides.get(line.discountTagId) ?? null : null;
    const automatica = resolveLineTag(descuentos, line.productId, null);

    // `discountTagId` presente en el body y distinto de lo que manda el acuerdo
    // es un override. `null` explícito también lo es: es "Sin descuento" pisando
    // una etiqueta que sí correspondía.
    const pisa =
      line.discountTagId !== undefined &&
      (line.discountTagId ?? null) !== (automatica?.id ?? null);

    if (pisa && !opts.allowOverride) {
      return {
        ok: false,
        error:
          "No tenés permiso para cambiar la etiqueta de descuento de un ítem. " +
          "Quitá el cambio y volvé a confirmar, o pedile a un administrador que registre la venta.",
      };
    }

    const tag = pisa ? override : automatica;
    const { tagDiscount, label } = calcItemTagDiscount({ total: line.total, tag } as LineaConEtiqueta);
    resolved.push({
      discountTagId: tagDiscount > 0 ? tag?.id ?? null : null,
      discountTagLabel: label,
      tagDiscount,
    });
  }

  const subtotal = round2(lines.reduce((suma, l) => suma + l.total, 0));
  const tagTotal = round2(resolved.reduce((suma, l) => suma + l.tagDiscount, 0));
  const split = splitDiscount(tagTotal, manualDiscount, subtotal);

  return {
    ok: true,
    ...split,
    ...resumirEtiquetas(resolved),
    lines: resolved,
  };
}

/**
 * Las etiquetas que le corresponden a un contacto, para **mostrar** antes de
 * vender: el formulario del CRM precarga con esto el dropdown de cada línea, y
 * el POS lo recibe junto con el cliente.
 *
 * Es la misma precedencia de `resolveLineTag` sin el paso 1 (no hay override
 * todavía) y sin Prisma del lado del cliente. Devolver esto —y no la tabla
 * cruda de acuerdos— es lo que hace que la pantalla no tenga que reimplementar
 * la regla del modo acuerdos.
 */
export async function getContactProductTags(
  contactId: string,
  productIds: string[]
): Promise<Record<string, TagResumen | null>> {
  const descuentos = await getContactDiscounts(contactId);
  const out: Record<string, TagResumen | null> = {};
  for (const productId of productIds) {
    out[productId] = resolveLineTag(descuentos, productId, null);
  }
  return out;
}

/**
 * La etiqueta pactada de un contacto para un solo producto. Azúcar sobre
 * `getContactProductTags` para los llamadores de una línea sola.
 */
export async function getContactProductTag(
  contactId: string,
  productId: string
): Promise<TagResumen | null> {
  return (await getContactProductTags(contactId, [productId]))[productId];
}

export { describeTag as describeDiscountTag };
