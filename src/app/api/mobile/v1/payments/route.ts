import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
import { rebuildAllocations } from "@/lib/account";

const log = createLogger("api/mobile/v1/payments");

const createPaymentSchema = z.object({
  saleId: z.string().min(1),
  amount: z.number().positive(),
  method: z.enum(["CASH", "TRANSFER", "CHECK", "CARD", "OTHER"]),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

/** Compara importes en centavos: evita que el ruido del punto flotante deje pasar un centavo de más. */
function cents(amount: number): number {
  return Math.round(amount * 100);
}

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
    const [sales, paidBySale] = await Promise.all([
      prisma.sale.findMany({
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
      }),
      // Un agregado en la base en vez de traer cada fila de pago de cada venta
      // para sumarla en JavaScript.
      prisma.payment.groupBy({ by: ["saleId"], _sum: { amount: true } }),
    ]);

    const paid = new Map(paidBySale.map((p) => [p.saleId, Number(p._sum.amount ?? 0)]));

    const pending = sales
      .map((sale) => {
        const totalPaid = paid.get(sale.id) ?? 0;
        return {
          id: sale.id,
          number: sale.number,
          contactName:
            sale.contact.company || `${sale.contact.firstName} ${sale.contact.lastName}`.trim(),
          total: Number(sale.total),
          totalPaid,
          remaining: Number(sale.total) - totalPaid,
          status: sale.status,
          createdAt: sale.createdAt.toISOString(),
        };
      })
      .filter((sale) => cents(sale.remaining) > 0);

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
  const { saleId, amount, method, reference, notes } = validation.data;

  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, contactId: true, number: true, total: true, status: true },
    });
    if (!sale) {
      return withMobileCors(NextResponse.json({ error: "Venta no encontrada" }, { status: 404 }));
    }

    // Una venta anulada ya devolvió su stock: cobrar contra ella deja plata
    // imputada a algo que no existe.
    if (sale.status === "CANCELLED") {
      return withMobileCors(
        NextResponse.json(
          { error: `La venta #${sale.number} está anulada: no se le pueden registrar pagos.` },
          { status: 409 }
        )
      );
    }

    // Ni el formulario ni el endpoint miraban el techo, así que un error de
    // tipeo dejaba la venta con saldo negativo.
    const agg = await prisma.payment.aggregate({ where: { saleId }, _sum: { amount: true } });
    const totalPaid = Number(agg._sum.amount ?? 0);
    const remaining = Number(sale.total) - totalPaid;

    if (cents(amount) > cents(remaining)) {
      return withMobileCors(
        NextResponse.json(
          {
            error:
              remaining > 0
                ? `El saldo de la venta #${sale.number} es $${remaining.toLocaleString("es-AR")}. No se puede cobrar de más.`
                : `La venta #${sale.number} ya está saldada.`,
          },
          { status: 409 }
        )
      );
    }

    const payment = await prisma.payment.create({
      data: {
        saleId,
        contactId: sale.contactId,
        amount: new Prisma.Decimal(amount),
        method,
        reference,
        notes,
      },
      include: {
        sale: { select: { id: true, number: true, total: true } },
        contact: { select: { id: true, firstName: true, lastName: true, company: true } },
      },
    });

    // Si la venta tiene plan de cuotas, imputa este pago. Sin plan no hace nada.
    await rebuildAllocations(saleId);

    const contactName =
      payment.contact.company || `${payment.contact.firstName} ${payment.contact.lastName}`.trim();
    await logOperatorAction({
      userId: gate.user.sub,
      action: "CREATE_PAYMENT",
      entityType: "PAYMENT",
      entityId: payment.id,
      description: `Registró pago $${amount} de "${contactName}" (app móvil)`,
      link: `/sales/${saleId}`,
    });

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
        },
        { status: 201 }
      )
    );
  } catch (error) {
    log.error({ err: error }, "Error creating payment");
    return withMobileCors(NextResponse.json({ error: "Error al registrar el pago" }, { status: 500 }));
  }
}
