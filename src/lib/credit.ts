import { prisma } from "@/lib/prisma";

export interface CreditCheckResult {
  ok: boolean;
  code?: "NO_CREDIT_TIER" | "CREDIT_LIMIT_EXCEEDED";
  error?: string;
  balance?: number;
  limit?: number;
  tier?: { id: string; code: string; name: string; limit: number };
}

/**
 * Outstanding balance across this contact's CONSIGNMENT sales (libres o en
 * cuotas — ambas son "crédito de consignación", no se distinguen acá).
 * Cancelled sales don't count: their debt was reversed. Same total−pagado
 * calculation used everywhere else in the app (getClientProfile, cuenta
 * corriente), just scoped to type: CONSIGNMENT.
 */
export async function getConsignmentBalance(contactId: string): Promise<number> {
  const sales = await prisma.sale.findMany({
    where: { contactId, type: "CONSIGNMENT", status: { not: "CANCELLED" } },
    include: { payments: { select: { amount: true } } },
  });
  return sales.reduce((sum, sale) => {
    const paid = sale.payments.reduce((s, p) => s + Number(p.amount), 0);
    return sum + (Number(sale.total) - paid);
  }, 0);
}

/**
 * Gate for creating a CONSIGNMENT sale. Read-only — call it before creating
 * the Sale, not inside its transaction. Two ways to fail:
 *   - NO_CREDIT_TIER: the contact has no escalafón assigned yet. The caller
 *     (POST /api/sales) surfaces this as its own error code so the UI can
 *     offer to assign one inline instead of just showing a dead-end error.
 *   - CREDIT_LIMIT_EXCEEDED: assigned, but this sale would push their
 *     outstanding consignment balance past the tier's limit.
 */
export async function checkConsignmentCredit(
  contactId: string,
  newSaleTotal: number
): Promise<CreditCheckResult> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { creditTier: true },
  });

  if (!contact?.creditTier) {
    return {
      ok: false,
      code: "NO_CREDIT_TIER",
      error: "Este cliente no tiene un escalafón de crédito asignado",
    };
  }

  const balance = await getConsignmentBalance(contactId);
  const limit = Number(contact.creditTier.limit);
  const projected = balance + newSaleTotal;
  const tier = { id: contact.creditTier.id, code: contact.creditTier.code, name: contact.creditTier.name, limit };

  if (projected > limit) {
    return {
      ok: false,
      code: "CREDIT_LIMIT_EXCEEDED",
      error: `Supera el límite del escalafón ${contact.creditTier.code} ($${limit.toLocaleString("es-AR")}). Saldo de consignación actual: $${balance.toLocaleString("es-AR")}. Esta venta: $${newSaleTotal.toLocaleString("es-AR")}.`,
      balance,
      limit,
      tier,
    };
  }

  return { ok: true, balance, limit, tier };
}
