import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
import { toCents } from "@/lib/account";
import { getSaleBalances, logPaymentCreated, registerPayment, PAYMENT_METHODS } from "@/lib/payments";

const log = createLogger("api/mobile/v1/payments");

const createPaymentSchema = z.object({
  saleId: z.string().min(1),
  amount: z.number().positive(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().optional(),
  notes: z.string().optional(),
  /**
   * Clave que genera el POS una vez por intento de cobro y repite en cada
   * reintento. En la ruta, sin señal, el pago llega, la respuesta se pierde y el
   * vendedor vuelve a tocar: con la misma clave no se crea un segundo pago.
   * Opcional para no romper un POS desplegado antes que este endpoint.
   */
  clientRequestId: z.string().min(8).max(64).optional(),
});

export function OPTIONS() {
  return mobileCorsPreflight();
}

// Sales with an outstanding balance — feeds the "Registrar pago" screen.
export async function GET(request: Request) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  try {
    // Una venta anulada conserva su total, así que su saldo sigue dando
    // positivo y aparecía acá como cobrable. El vendedor en la ruta cobra
    // contra esta lista sin manera de saber que la venta ya no existe.
    const sales = await prisma.sale.findMany({
      where: { status: { not: "CANCELLED" } },
      select: {
        id: true,
        number: true,
        total: true,
        status: true,
        createdAt: true,
        contact: { select: { id: true, firstName: true, lastName: true, company: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // El saldo descuenta las devoluciones a crédito: sin eso, a una venta con
    // mercadería devuelta se le pedía el total original (ver computeSaleRemaining).
    const balances = await getSaleBalances(sales.map((s) => s.id));

    const pending = sales
      .map((sale) => {
        const b = balances.get(sale.id);
        return {
          id: sale.id,
          number: sale.number,
          contactName:
            sale.contact.company || `${sale.contact.firstName} ${sale.contact.lastName}`.trim(),
          total: Number(sale.total),
          totalPaid: b?.paid ?? 0,
          remaining: b?.remaining ?? Number(sale.total),
          status: sale.status,
          createdAt: sale.createdAt.toISOString(),
        };
      })
      .filter((sale) => toCents(sale.remaining) > 0);

    return withMobileCors(NextResponse.json({ sales: pending }));
  } catch (error) {
    log.error({ err: error }, "Error fetching pending payments");
    return withMobileCors(NextResponse.json({ error: "Error al buscar pagos pendientes" }, { status: 500 }));
  }
}

export async function POST(request: Request) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  const json = await request.json().catch(() => null);
  const validation = validateBody(createPaymentSchema, json);
  if (!validation.success) return withMobileCors(validation.response);
  const { saleId, amount, method, reference, notes, clientRequestId } = validation.data;

  try {
    const result = await registerPayment({ saleId, amount, method, reference, notes, clientRequestId });
    if (!result.ok) {
      return withMobileCors(NextResponse.json({ error: result.error }, { status: result.status }));
    }

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: result.paymentId },
      include: {
        sale: { select: { id: true, number: true, total: true } },
        contact: { select: { id: true, firstName: true, lastName: true, company: true } },
      },
    });

    // Un reintento que encontró el pago ya creado no se vuelve a auditar: el
    // alta quedó registrada la primera vez.
    if (!result.duplicate) {
      const contactName =
        payment.contact.company || `${payment.contact.firstName} ${payment.contact.lastName}`.trim();
      const description = `Registró pago $${amount} de "${contactName}" (app móvil)`;
      await logPaymentCreated({ saleId, paymentId: payment.id, userId: gate.user.sub, amount, method, description });
      await logOperatorAction({
        userId: gate.user.sub,
        action: "CREATE_PAYMENT",
        entityType: "PAYMENT",
        entityId: payment.id,
        description,
        link: `/sales/${saleId}`,
      });
    }

    return withMobileCors(
      NextResponse.json(
        {
          payment: {
            id: payment.id,
            amount: Number(payment.amount),
            method: payment.method,
            reference: payment.reference,
            sale: { id: payment.sale.id, number: payment.sale.number, total: Number(payment.sale.total) },
            contact: payment.contact,
          },
          duplicate: result.duplicate,
        },
        { status: result.duplicate ? 200 : 201 }
      )
    );
  } catch (error) {
    log.error({ err: error }, "Error creating payment");
    return withMobileCors(NextResponse.json({ error: "Error al registrar el pago" }, { status: 500 }));
  }
}
