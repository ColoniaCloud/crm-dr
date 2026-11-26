import { NextResponse } from "next/server";
import { computeSaleRemaining, sumCreditedReturns } from "@/lib/account-calc";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { requireRole } from "@/lib/api-auth";
const log = createLogger("api/payments/debts");

export async function GET() {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;

  try {
    // Las anuladas no son deuda: antes aparecían acá con su total entero.
    const sales = await prisma.sale.findMany({
      where: { status: { not: "CANCELLED" } },
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, company: true },
        },
        payments: { select: { amount: true } },
        returns: { select: { total: true, refund: true } },
      },
    });

    const debts = sales
      .map((sale) => {
        const paid = sale.payments.reduce(
          (sum, p) => sum + Number(p.amount),
          0
        );
        const total = Number(sale.total);
        const remaining = computeSaleRemaining({
          total,
          paid,
          creditedReturns: sumCreditedReturns(sale.returns),
        });
        const contact = sale.contact;
        const clientName = contact
          ? contact.company ||
            `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim()
          : "—";
        return {
          id: sale.id,
          saleId: sale.id,
          saleNumber: sale.number,
          clientName,
          contactId: sale.contactId,
          total,
          paid,
          remaining,
        };
      })
      .filter((d) => d.remaining > 0.001);

    return NextResponse.json(debts);
  } catch (error) {
    log.error({ err: error }, "Error fetching debts");
    return NextResponse.json(
      { error: "Error fetching debts" },
      { status: 500 }
    );
  }
}
