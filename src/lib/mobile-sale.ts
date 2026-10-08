import type { Contact, Payment, Sale, SaleItem } from "@prisma/client";

type SaleForSerialization = Sale & {
  contact: Pick<Contact, "id" | "firstName" | "lastName" | "company" | "cuit"> &
    Partial<Pick<Contact, "email" | "phone">>;
  /** Para que el POS sepa si falta la firma. Opcional: no todas las rutas lo piden. */
  remito?: { number: number; signedAt: Date | null; signedVia: string | null } | null;
  items: (SaleItem & { product: { id: string; name: string; sku: string | null } })[];
  payments: Payment[];
};

// Prisma's Decimal fields serialize to strings via JSON.stringify — this
// coerces every money field to a plain number so mobile clients (whose zod
// schemas and TS types expect `number`) get consistent shapes from both
// POST /sales and GET /sales/:id.
export function serializeSaleDetail(sale: SaleForSerialization) {
  const totalPaid = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);

  return {
    id: sale.id,
    number: sale.number,
    contact: sale.contact,
    status: sale.status,
    requiresFactura: sale.requiresFactura,
    notes: sale.notes,
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    // Desglose del descuento: cuanto pusieron las etiquetas y cuanto se cargo a
    // mano. El POS lo necesita para que el ticket explique de donde salio cada
    // peso en vez de mostrar un numero suelto.
    //
    // Desde octubre 2026 el detalle real vive en los items —cada linea con su
    // etiqueta— y esto es la suma. `discountTagLabel` dice "N etiquetas por item"
    // cuando la venta llevo varias; ver resumirEtiquetas() en discount-tags.ts.
    tagDiscount: Number(sale.tagDiscount),
    // Acotado a 0: un admin puede reescribir los totales a mano desde el
    // detalle de la venta, y ahi `discount` puede terminar por debajo de lo que
    // habia puesto la etiqueta.
    manualDiscount: Math.max(0, Number(sale.discount) - Number(sale.tagDiscount)),
    discountTagLabel: sale.discountTagLabel,
    tax: Number(sale.tax),
    total: Number(sale.total),
    totalPaid,
    remaining: Number(sale.total) - totalPaid,
    createdAt: sale.createdAt.toISOString(),
    remito: sale.remito
      ? { number: sale.remito.number, signedAt: sale.remito.signedAt?.toISOString() ?? null, signedVia: sale.remito.signedVia }
      : null,
    items: sale.items.map((item) => ({
      id: item.id,
      productName: item.product.name,
      sku: item.product.sku,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      /** BRUTO: quantity × unitPrice. El neto es `total - tagDiscount`. */
      total: Number(item.total),
      /** Lo que descontó la etiqueta de ESTA linea, y cual fue. */
      tagDiscount: Number(item.tagDiscount),
      discountTagLabel: item.discountTagLabel,
    })),
    payments: sale.payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      method: p.method,
      reference: p.reference,
      paidAt: p.paidAt.toISOString(),
    })),
  };
}
