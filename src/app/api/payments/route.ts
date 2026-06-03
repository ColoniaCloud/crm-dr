import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
const log = createLogger("api/payments");

const createPaymentSchema = z.object({
  saleId: z.string().min(1),
  contactId: z.string().optional(),
  amount: z.number().positive(),
  method: z.enum(["CASH", "TRANSFER", "CHECK", "CARD", "OTHER"]),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const role = session.user.role as string;
  if (role !== "ADMIN" && role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const pending = searchParams.get("pending");

    if (pending === "true") {
      // Find sales where total > sum of payments
      const sales = await prisma.sale.findMany({
        include: {
          contact: {
            select: { id: true, firstName: true, lastName: true, company: true },
          },
          payments: true,
        },
      });

      const pendingPayments = sales
        .filter((sale) => {
          const totalPaid = sale.payments.reduce(
            (sum, payment) => sum + Number(payment.amount),
            0
          );
          return totalPaid < Number(sale.total);
        })
        .map((sale) => {
          const totalPaid = sale.payments.reduce(
            (sum, payment) => sum + Number(payment.amount),
            0
          );
          return {
            ...sale,
            totalPaid,
            remaining: Number(sale.total) - totalPaid,
          };
        });

      return NextResponse.json(pendingPayments);
    }

    const payments = await prisma.payment.findMany({
      include: {
        sale: { select: { number: true } },
        contact: { select: { firstName: true, lastName: true, company: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = payments.map((p) => ({
      id: p.id,
      number: p.number,
      date: p.createdAt.toISOString(),
      clientName: p.contact
        ? p.contact.company ||
          `${p.contact.firstName ?? ""} ${p.contact.lastName ?? ""}`.trim()
        : "—",
      saleNumber: p.sale?.number ?? "—",
      amount: Number(p.amount),
      method: p.method,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    log.error({ err: error }, "Error fetching payments");
    return NextResponse.json(
      { error: "Error fetching payments" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const role = session.user.role as string;
  if (role !== "ADMIN" && role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = validateBody(createPaymentSchema, body);
    if (!parsed.success) return parsed.response;
    const { saleId, contactId, amount, method, reference, notes } = parsed.data;

    // Use provided contactId, or derive from sale if not provided
    let resolvedContactId = contactId;

    if (!resolvedContactId) {
      const sale = await prisma.sale.findUnique({
        where: { id: saleId },
      });

      if (!sale) {
        return NextResponse.json({ error: "Sale not found" }, { status: 404 });
      }

      resolvedContactId = sale.contactId;
    }

    const payment = await prisma.payment.create({
      data: {
        saleId,
        contactId: resolvedContactId,
        amount: new Prisma.Decimal(amount),
        method,
        reference,
        notes,
      },
      include: {
        sale: {
          select: { id: true, number: true, total: true },
        },
        contact: {
          select: { id: true, firstName: true, lastName: true, company: true },
        },
      },
    });

    const pName = payment.contact.company || `${payment.contact.firstName} ${payment.contact.lastName}`.trim();
    await logOperatorAction({ userId: session.user.id, action: "CREATE_PAYMENT", entityType: "PAYMENT", entityId: payment.id, description: `Registró pago $${amount} de "${pName}"`, link: `/sales/${saleId}` });
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating payment");
    return NextResponse.json(
      { error: "Error creating payment" },
      { status: 500 }
    );
  }
}
