import type { Prisma } from "@prisma/client";
import { round2 } from "@/lib/account-calc";
import { releaseRollForSaleItem } from "@/lib/warranty";

type Tx = Prisma.TransactionClient;

export type RefundMethod = "CREDIT_NOTE" | "CASH";

export interface SaleReturnItemInput {
  saleItemId: string;
  quantity: number;
}

export interface CreateSaleReturnInput {
  saleId: string;
  userId: string;
  refund: RefundMethod;
  reason?: string | null;
  items: SaleReturnItemInput[];
}

export interface CreateSaleReturnOk {
  ok: true;
  id: string;
  number: number;
  saleNumber: number;
  /** Los ítems a precio de venta, sin IVA ni descuento. */
  subtotal: number;
  /** Lo que se acredita: `subtotal` con el IVA y el descuento prorrateados. */
  total: number;
  refund: RefundMethod;
  /**
   * Rollos que siguen atados a la venta porque el cliente final ya activó la
   * garantía. Quien llama TIENE que mostrarlos: la mercadería volvió igual,
   * pero esos rollos no vuelven a stock solos.
   */
  retainedRolls: string[];
}

export type CreateSaleReturnResult = CreateSaleReturnOk | { ok: false; error: string };

/**
 * Cuántas unidades de cada ítem de la venta ya se devolvieron. La clave es el
 * `saleItemId`; un ítem que nunca se devolvió no aparece en el mapa.
 */
export async function getReturnedQuantities(
  db: Tx,
  saleId: string
): Promise<Map<string, number>> {
  const previos = await db.saleReturn.findMany({
    where: { saleId },
    select: { items: { select: { saleItemId: true, quantity: true } } },
  });

  const devueltas = new Map<string, number>();
  for (const devolucion of previos) {
    for (const item of devolucion.items) {
      devueltas.set(item.saleItemId, (devueltas.get(item.saleItemId) ?? 0) + item.quantity);
    }
  }
  return devueltas;
}

/**
 * Cuánto vale, en plata acreditable, un peso de mercadería de esta venta.
 *
 * Los ítems suman el subtotal, pero el cliente debe el total: IVA sumado y
 * descuento restado. Devolver acreditando el precio pelado de los ítems dejaba
 * al cliente debiendo el IVA de mercadería que ya no tiene — y en una venta con
 * descuento, acreditándole de más.
 *
 * Una venta con subtotal cero no debería existir; si aparece, se acredita uno
 * a uno en vez de dividir por cero.
 *
 * ─── OJO: ya no alcanza sola ────────────────────────────────────────────────
 *
 * Prorratea el descuento de forma **uniforme** sobre toda la mercadería, y eso
 * es correcto solo mientras todas las líneas lleven el mismo descuento. Desde
 * que la etiqueta se aplica por línea (octubre 2026) una venta puede tener
 * 16,66% en una línea y 0% en otras dos: devolver la línea sin descuento
 * acreditaría el 94% cuando le corresponde el 100%, y devolver la que sí tuvo
 * acreditaría de más. Sistemáticamente mal en las dos direcciones.
 *
 * Sigue exportada porque es la mitad correcta de la cuenta —la parte del
 * descuento cargado A MANO, que sí es de toda la venta— y la usa
 * `creditRatioNeto`. **Para acreditar, usar `creditPerUnit`.**
 */
export function creditRatio(sale: { subtotal: unknown; total: unknown }): number {
  const subtotal = Number(sale.subtotal);
  const total = Number(sale.total);
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 1;
  return total / subtotal;
}

/**
 * La parte de la cuenta que SÍ es de toda la venta: el descuento cargado a mano
 * (y en su momento el IVA), prorrateado sobre la base **neta de etiquetas**.
 *
 * Se aplica sobre el neto de cada línea, no sobre su bruto — ver `creditPerUnit`.
 */
function creditRatioNeto(sale: { subtotal: unknown; tagDiscount: unknown; total: unknown }): number {
  const base = Number(sale.subtotal) - Number(sale.tagDiscount);
  const total = Number(sale.total);
  if (!Number.isFinite(base) || base <= 0) return 1;
  return total / base;
}

/**
 * Cuánto se le acredita al cliente por **cada unidad** devuelta de esta línea.
 *
 * ```
 * (unitPrice − tagDiscount/quantity) × total / (subtotal − tagDiscount)
 *   └─ el neto unitario de la línea ─┘   └─ el descuento a mano prorrateado ─┘
 * ```
 *
 * El descuento de la etiqueta se descuenta de **su propia línea**, que es el
 * arreglo; el cargado a mano se prorratea, porque es de la venta entera.
 *
 * ─── Por qué esto da lo mismo que antes para las ventas viejas ──────────────
 *
 * Después del backfill (scripts/backfill-item-tag-discount.ts), una venta vieja
 * tiene `item.tagDiscount = sale.tagDiscount × item.total / sale.subtotal`.
 * Sustituyendo:
 *
 *   neto de la línea = item.total × (subtotal − tagDiscount) / subtotal
 *   × total / (subtotal − tagDiscount)  =  item.total × total / subtotal
 *                                       =  item.total × creditRatio(sale)   ✓
 *
 * O sea: **exactamente el número que se acreditaba antes**. Por eso el cambio se
 * puede verificar contra las devoluciones ya emitidas en vez de confiar en que
 * está bien — el script del backfill lo comprueba.
 */
export function creditPerUnit(
  sale: { subtotal: unknown; tagDiscount: unknown; total: unknown },
  saleItem: { unitPrice: unknown; tagDiscount: unknown; quantity: number }
): number {
  const unitPrice = Number(saleItem.unitPrice);
  const tagPorUnidad =
    saleItem.quantity > 0 ? Number(saleItem.tagDiscount) / saleItem.quantity : 0;
  return round2((unitPrice - tagPorUnidad) * creditRatioNeto(sale));
}

/**
 * Registra una devolución (total o parcial) sobre una venta ya entregada.
 *
 * Tiene que correr dentro de una transacción: mueve stock, libera rollos de
 * garantía y toca la cuenta corriente, y esas tres cosas o pasan juntas o no
 * pasa ninguna. Devuelve `ok: false` con un mensaje para el operador en vez de
 * tirar excepción, así quien llama decide si aborta la transacción — mismo
 * criterio que `restoreSaleStock()`.
 *
 * Qué hace, en orden:
 *
 * 1. Valida que la venta admita devolución y que no se devuelva más de lo que
 *    se vendió (contando las devoluciones anteriores de la misma venta).
 * 2. Devuelve el stock, con un `StockMovement` DEVOLUCION por producto.
 * 3. Libera el rollo de garantía de los ítems que quedaron devueltos por
 *    completo. Si el cliente final ya activó la garantía, el rollo NO se
 *    libera y se informa en `retainedRolls`.
 * 4. Emite una nota de crédito por el importe devuelto y, si se devolvió
 *    efectivo, un segundo ajuste por la plata que salió de la caja.
 *
 * Lo que NO hace, a propósito: tocar `Sale.total`, `Sale.status` ni los pagos.
 * La venta original queda como fue —con su remito y su factura— y la
 * devolución vive al lado. Editar la venta haría que el remito ya entregado no
 * coincida con lo que dice el sistema.
 */
export async function createSaleReturn(
  tx: Tx,
  input: CreateSaleReturnInput
): Promise<CreateSaleReturnResult> {
  const { saleId, userId, refund, items } = input;

  if (items.length === 0) {
    return { ok: false, error: "Elegí al menos un producto para devolver" };
  }

  const vistos = new Set<string>();
  for (const item of items) {
    if (vistos.has(item.saleItemId)) {
      return { ok: false, error: "Hay un producto repetido en la devolución" };
    }
    vistos.add(item.saleItemId);
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return {
        ok: false,
        error: "Las cantidades a devolver tienen que ser números enteros mayores a cero",
      };
    }
  }

  // Candado sobre la fila de la venta, tomado ANTES de leer lo ya devuelto y
  // sostenido hasta que la transacción cierra.
  //
  // Sin esto, dos devoluciones simultáneas de la misma venta leen las dos el
  // mismo "quedan 3 sin devolver", las dos validan, y las dos escriben: vuelven
  // 6 unidades de 3 y se acreditan dos notas de crédito. Es la única parte del
  // archivo donde la validación no alcanza, porque lo que valida es un dato que
  // la otra transacción todavía no escribió.
  //
  // Es el primer `FOR UPDATE` del CRM. No es gratis —serializa las devoluciones
  // de una misma venta— pero son pocas y cortas, y devolver de más no se
  // detecta después: queda como stock que existe en el sistema y no en el
  // depósito.
  await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId} FOR UPDATE`;

  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    include: { items: { include: { product: { select: { name: true } } } } },
  });
  if (!sale) return { ok: false, error: "Venta no encontrada" };

  // PENDING nunca descontó stock (lo hace confirmSale) y CANCELLED ya se
  // revirtió entera con restoreSaleStock: devolver sobre cualquiera de las dos
  // inflaría el stock con mercadería que nunca salió.
  if (sale.status !== "CONFIRMED" && sale.status !== "DELIVERED") {
    return {
      ok: false,
      error:
        sale.status === "PENDING"
          ? "Esta venta todavía no se confirmó, así que no salió mercadería — no hay nada que devolver"
          : "Esta venta está anulada: su stock ya volvió cuando se anuló",
    };
  }

  const devueltas = await getReturnedQuantities(tx, saleId);

  // Se arma la lista completa antes de escribir nada, para que un error de
  // cantidad en el último producto no deje los anteriores ya aplicados.
  const aDevolver: {
    saleItem: (typeof sale.items)[number];
    quantity: number;
    /** Bruto: unitPrice × quantity. */
    total: number;
    /** Acreditable: el neto de la línea con el descuento a mano prorrateado. */
    credito: number;
  }[] = [];

  for (const item of items) {
    const saleItem = sale.items.find((i) => i.id === item.saleItemId);
    if (!saleItem) {
      return { ok: false, error: `Uno de los productos no pertenece a la venta #${sale.number}` };
    }
    const disponible = saleItem.quantity - (devueltas.get(saleItem.id) ?? 0);
    if (disponible <= 0) {
      return { ok: false, error: `"${saleItem.product.name}" ya se devolvió por completo` };
    }
    if (item.quantity > disponible) {
      return {
        ok: false,
        error: `De "${saleItem.product.name}" quedan ${disponible} sin devolver y pediste ${item.quantity}`,
      };
    }
    aDevolver.push({
      saleItem,
      quantity: item.quantity,
      total: round2(Number(saleItem.unitPrice) * item.quantity),
      // Lo acreditable de esta parte de la línea, con SU propio descuento de
      // etiqueta descontado y el cargado a mano prorrateado. Se guarda acá para
      // que el total de abajo sea una suma y no dos cuentas distintas.
      credito: round2(creditPerUnit(sale, saleItem) * item.quantity),
    });
  }

  // `subtotal` sigue siendo el bruto de lo devuelto: es lo que se guarda en
  // SaleReturn.subtotal y lo que el remito de devolución muestra como
  // mercadería. El descuento vive en la diferencia con `total`.
  const subtotal = round2(aDevolver.reduce((suma, i) => suma + i.total, 0));
  // Y el total es la suma de los créditos por línea. Antes era
  // `subtotal × creditRatio(sale)` — un prorrateo uniforme que dejó de valer
  // cuando cada línea puede llevar su propio descuento (ver creditPerUnit).
  const total = round2(aDevolver.reduce((suma, i) => suma + i.credito, 0));
  if (total <= 0) {
    return { ok: false, error: "El importe a devolver da cero" };
  }

  // Reintegrar efectivo que el cliente nunca pagó no es una devolución: el
  // saldo quedaría igual y la caja con un agujero que nadie pidió.
  if (refund === "CASH") {
    const [pagos, efectivoPrevio] = await Promise.all([
      tx.payment.aggregate({ where: { saleId }, _sum: { amount: true } }),
      tx.saleReturn.aggregate({ where: { saleId, refund: "CASH" }, _sum: { total: true } }),
    ]);
    const disponible = round2(
      Number(pagos._sum.amount ?? 0) - Number(efectivoPrevio._sum.total ?? 0)
    );
    if (disponible <= 0) {
      return {
        ok: false,
        error:
          "Esta venta no tiene pagos disponibles para reintegrar en efectivo — hacé la devolución como nota de crédito",
      };
    }
    if (total > disponible) {
      return {
        ok: false,
        error: `Solo hay ${disponible} para reintegrar en efectivo (es lo que el cliente pagó y todavía no se le devolvió). Por el resto, usá nota de crédito.`,
      };
    }
  }

  const saleReturn = await tx.saleReturn.create({
    data: {
      saleId,
      contactId: sale.contactId,
      userId,
      refund,
      subtotal,
      total,
      currency: sale.currency,
      reason: input.reason?.trim() || null,
      items: {
        create: aDevolver.map((i) => ({
          saleItemId: i.saleItem.id,
          productId: i.saleItem.productId,
          quantity: i.quantity,
          unitPrice: i.saleItem.unitPrice,
          total: i.total,
        })),
      },
    },
    select: { id: true, number: true },
  });

  const motivo = `Devolución #${saleReturn.number} sobre venta #${sale.number}`;

  for (const i of aDevolver) {
    const product = await tx.product.findUnique({ where: { id: i.saleItem.productId } });
    if (!product) continue;
    const stockBefore = product.stock;
    const stockAfter = stockBefore + i.quantity;
    await tx.product.update({
      where: { id: i.saleItem.productId },
      data: { stock: stockAfter },
    });
    await tx.stockMovement.create({
      data: {
        productId: i.saleItem.productId,
        type: "DEVOLUCION",
        quantity: i.quantity,
        stockBefore,
        stockAfter,
        referenceId: saleReturn.id,
        referenceType: "RETURN",
        reason: motivo,
        userId,
      },
    });
  }

  // El rollo es uno por ítem de venta, no uno por unidad: solo se libera
  // cuando el ítem quedó devuelto entero.
  const retainedRolls: string[] = [];
  for (const i of aDevolver) {
    const devueltoTotal = (devueltas.get(i.saleItem.id) ?? 0) + i.quantity;
    if (devueltoTotal < i.saleItem.quantity) continue;

    const roll = await tx.warrantyRoll.findUnique({
      where: { saleItemId: i.saleItem.id },
      select: { fullRollCode: true, installations: { select: { status: true } } },
    });
    if (!roll) continue;

    if (roll.installations.some((inst) => inst.status === "ACTIVE")) {
      retainedRolls.push(roll.fullRollCode);
      continue;
    }
    await releaseRollForSaleItem(tx, i.saleItem.id);
  }

  // La mercadería volvió: la deuda baja siempre, haya salido plata o no.
  const creditNote = await tx.accountAdjustment.create({
    data: {
      contactId: sale.contactId,
      type: "CREDIT_NOTE",
      amount: -total,
      currency: sale.currency,
      description: `Nota de crédito por devolución #${saleReturn.number} (venta #${sale.number})`,
      createdById: userId,
    },
    select: { id: true },
  });

  // Y si además se le devolvió la plata, eso es un movimiento aparte: sin este
  // segundo ajuste el cliente quedaría con saldo a favor por una plata que ya
  // tiene en la mano.
  const refundAdjustment =
    refund === "CASH"
      ? await tx.accountAdjustment.create({
          data: {
            contactId: sale.contactId,
            type: "REFUND",
            amount: total,
            currency: sale.currency,
            description: `Efectivo reintegrado al cliente por la devolución #${saleReturn.number}`,
            createdById: userId,
          },
          select: { id: true },
        })
      : null;

  await tx.saleReturn.update({
    where: { id: saleReturn.id },
    data: {
      creditNoteAdjustmentId: creditNote.id,
      refundAdjustmentId: refundAdjustment?.id ?? null,
      retainedRolls: retainedRolls.length > 0 ? retainedRolls.join(", ") : null,
    },
  });

  return {
    ok: true,
    id: saleReturn.id,
    number: saleReturn.number,
    saleNumber: sale.number,
    subtotal,
    total,
    refund,
    retainedRolls,
  };
}
