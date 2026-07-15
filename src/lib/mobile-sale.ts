import type { Contact, Payment, Sale, SaleItem } from "@prisma/client";

type SaleForSerialization = Sale & {
  contact: Pick<Contact, "id" | "firstName" | "lastName" | "company" | "cuit">;
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
    requiresFactura: sale.requiresFactura,
    notes: sale.notes,
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    tax: Number(sale.tax),
    total: Number(sale.total),
    totalPaid,
    remaining: Number(sale.total) - totalPaid,
    createdAt: sale.createdAt.toISOString(),
    items: sale.items.map((item) => ({
      id: item.id,
      productName: item.product.name,
      sku: item.product.sku,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
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
