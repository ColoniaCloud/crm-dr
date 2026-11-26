import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { toCents } from "@/lib/account";
import { getSaleBalances, logPaymentCreated, registerPayment } from "@/lib/payments";
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
      // Ventas con saldo. Las anuladas no son deuda, y las devoluciones a
      // crédito bajan el saldo aunque no haya un pago de por medio.
      const sales = await prisma.sale.findMany({
        where: { status: { not: "CANCELLED" } },
        include: {
          contact: {
            select: { id: true, firstName: true, lastName: true, company: true },
          },
          payments: true,
        },
      });
      const balances = await getSaleBalances(sales.map((s) => s.id));

      const pendingPayments = sales
        .map((sale) => {
          const b = balances.get(sale.id);
          return {
            ...sale,
            totalPaid: b?.paid ?? 0,
            remaining: b?.remaining ?? Number(sale.total),
          };
        })
        .filter((sale) => toCents(sale.remaining) > 0);

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
      date: p.paidAt.toISOString(),
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

    // Mismo camino que la app móvil y las declaraciones del portal: tope de
    // saldo, venta anulada, cliente de la venta y bloqueo contra cobros
    // simultáneos (ver src/lib/payments.ts).
    const result = await registerPayment({
      saleId,
      amount,
      method,
      reference,
      notes,
      expectedContactId: contactId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: result.paymentId },
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
    const description = `Registró pago $${amount} de "${pName}"`;
    await logPaymentCreated({ saleId, paymentId: payment.id, userId: session.user.id, amount, method, description });
    await logOperatorAction({ userId: session.user.id, action: "CREATE_PAYMENT", entityType: "PAYMENT", entityId: payment.id, description, link: `/sales/${saleId}` });
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating payment");
    return NextResponse.json(
      { error: "Error creating payment" },
      { status: 500 }
    );
  }
}
