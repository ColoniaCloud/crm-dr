import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import {
  buildInstallmentSchedule,
  computeInstallmentStatus,
  rebuildAllocations,
} from "@/lib/account";

const log = createLogger("api/sales/[id]/payment-plan");

/**
 * Plan de cuotas de una venta. Como máximo uno por venta (`saleId` es único).
 *
 * El plan es opcional: una venta sin plan se cobra al contado o con pagos
 * sueltos, que es como funcionan hoy todas las ventas. Crear un plan sobre una
 * venta que ya tenía pagos NO los anula — se imputan hacia atrás por FIFO.
 */

const createSchema = z.object({
  installmentCount: z.number().int().min(2).max(60),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM"]),
  firstDueDate: z.string().min(1),
  /** Por defecto el total de la venta. Distinto solo si se cobra recargo. */
  financedTotal: z.number().positive().optional(),
  interestRate: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;

  try {
    const { id } = await params;
    const plan = await prisma.paymentPlan.findUnique({
      where: { saleId: id },
      include: {
        createdBy: { select: { id: true, name: true } },
        installments: {
          orderBy: { number: "asc" },
          include: { allocations: { select: { amount: true } } },
        },
      },
    });

    if (!plan) return NextResponse.json(null);

    const now = new Date();
    const installments = plan.installments.map((c) => {
      const amount = Number(c.amount);
      const paid = Math.round(c.allocations.reduce((s, a) => s + Number(a.amount), 0) * 100) / 100;
      return {
        id: c.id,
        number: c.number,
        dueDate: c.dueDate.toISOString(),
        amount,
        paid,
        remaining: Math.round(Math.max(0, amount - paid) * 100) / 100,
        status: computeInstallmentStatus(amount, paid, c.dueDate, now),
      };
    });

    return NextResponse.json({
      id: plan.id,
      installmentCount: plan.installmentCount,
      frequency: plan.frequency,
      firstDueDate: plan.firstDueDate.toISOString(),
      financedTotal: Number(plan.financedTotal),
      interestRate: plan.interestRate ? Number(plan.interestRate) : null,
      status: plan.status,
      notes: plan.notes,
      createdBy: plan.createdBy.name,
      createdAt: plan.createdAt.toISOString(),
      installments,
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching payment plan");
    return NextResponse.json({ error: "Error al cargar el plan de cuotas" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = validateBody(createSchema, body);
  if (!parsed.success) return parsed.response;
  const { installmentCount, frequency, firstDueDate, financedTotal, interestRate, notes } = parsed.data;

  const primerVto = new Date(firstDueDate);
  if (Number.isNaN(primerVto.getTime())) {
    return NextResponse.json({ error: "La fecha del primer vencimiento no es válida" }, { status: 400 });
  }

  try {
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        contact: { select: { firstName: true, lastName: true, company: true } },
        paymentPlan: { select: { id: true, status: true } },
      },
    });
    if (!sale) {
      return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
    }
    if (sale.status === "CANCELLED") {
      return NextResponse.json(
        { error: "No se puede armar un plan de cuotas sobre una venta anulada" },
        { status: 400 }
      );
    }
    if (sale.paymentPlan && sale.paymentPlan.status === "ACTIVE") {
      return NextResponse.json(
        { error: "Esta venta ya tiene un plan de cuotas activo. Cancelalo antes de crear otro." },
        { status: 409 }
      );
    }

    const total = financedTotal ?? Number(sale.total);
    const cuotas = buildInstallmentSchedule({
      total,
      installmentCount,
      frequency,
      firstDueDate: primerVto,
    });

    const plan = await prisma.$transaction(async (tx) => {
      // Un plan cancelado se reemplaza; sus cuotas se van por cascada.
      if (sale.paymentPlan) {
        await tx.paymentPlan.delete({ where: { id: sale.paymentPlan.id } });
      }

      const creado = await tx.paymentPlan.create({
        data: {
          saleId: id,
          installmentCount,
          frequency,
          firstDueDate: primerVto,
          financedTotal: new Prisma.Decimal(total),
          ...(interestRate !== undefined ? { interestRate: new Prisma.Decimal(interestRate) } : {}),
          ...(notes ? { notes } : {}),
          createdById: session.user.id,
          installments: {
            create: cuotas.map((c) => ({
              number: c.number,
              dueDate: c.dueDate,
              amount: new Prisma.Decimal(c.amount),
            })),
          },
        },
      });

      // Imputa los pagos que la venta ya tenía. Sin esto, una venta con pagos
      // previos mostraría todas las cuotas impagas.
      await rebuildAllocations(id, tx);

      return creado;
    });

    const cName = sale.contact.company || `${sale.contact.firstName} ${sale.contact.lastName}`.trim();
    await logOperatorAction({
      userId: session.user.id,
      action: "CREATE_PAYMENT_PLAN",
      entityType: "SALE",
      entityId: id,
      description: `Armó un plan de ${installmentCount} cuotas sobre la venta #${sale.number} de "${cName}"`,
      link: `/sales/${id}`,
    });

    return NextResponse.json({ id: plan.id, installmentCount }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating payment plan");
    return NextResponse.json({ error: "Error al crear el plan de cuotas" }, { status: 500 });
  }
}

/**
 * Cancela el plan. No borra nada: la venta vuelve a comportarse como pagos
 * sueltos y el saldo queda intacto (nunca dependió de las cuotas). Las
 * imputaciones se limpian porque ya no hay cuotas vigentes que cubrir.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id } = await params;
    const plan = await prisma.paymentPlan.findUnique({
      where: { saleId: id },
      include: { sale: { select: { number: true, contact: { select: { firstName: true, lastName: true, company: true } } } } },
    });
    if (!plan) {
      return NextResponse.json({ error: "Esta venta no tiene plan de cuotas" }, { status: 404 });
    }
    if (plan.status === "CANCELLED") {
      return NextResponse.json({ error: "El plan ya estaba cancelado" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.paymentPlan.update({ where: { id: plan.id }, data: { status: "CANCELLED" } });
      await rebuildAllocations(id, tx);
    });

    const c = plan.sale.contact;
    const cName = c.company || `${c.firstName} ${c.lastName}`.trim();
    await logOperatorAction({
      userId: session.user.id,
      action: "CANCEL_PAYMENT_PLAN",
      entityType: "SALE",
      entityId: id,
      description: `Canceló el plan de cuotas de la venta #${plan.sale.number} de "${cName}"`,
      link: `/sales/${id}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error cancelling payment plan");
    return NextResponse.json({ error: "Error al cancelar el plan de cuotas" }, { status: 500 });
  }
}
