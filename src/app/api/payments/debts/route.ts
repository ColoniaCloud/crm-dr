import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/payments/debts");

export async function GET() {
  try {
    const sales = await prisma.sale.findMany({
      include: {
        contact: {
          select: { firstName: true, lastName: true, company: true },
        },
        payments: { select: { amount: true } },
      },
    });

    const debts = sales
      .map((sale) => {
        const paid = sale.payments.reduce(
          (sum, p) => sum + Number(p.amount),
          0
        );
        const total = Number(sale.total);
        const remaining = total - paid;
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
