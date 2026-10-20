import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { isMonthKey, recurringAppliesTo, recurringDueDate, round2, toARS } from "@/lib/expenses";

const log = createLogger("api/expenses/recurring/[id]/generate");

const schema = z.object({
  month: z.string().refine(isMonthKey, "Mes inválido (AAAA-MM)"),
  /** El monto real de este mes, si no es el de la plantilla. */
  amount: z.coerce.number().positive().max(9_999_999_999).optional(),
  paidAt: z.coerce.date().optional(),
  exchangeRate: z.coerce.number().positive().max(1_000_000).optional().nullable(),
});

/**
 * Carga el gasto de un recurrente para un mes. El índice único
 * (recurringExpenseId, recurringPeriod) impide cargarlo dos veces aunque se
 * haga doble clic o dos pestañas lo intenten a la vez.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const { id } = await params;
  const parsed = validateBody(schema, await request.json().catch(() => null));
  if (!parsed.success) return parsed.response;
  const { month } = parsed.data;

  try {
    const r = await prisma.recurringExpense.findUnique({ where: { id } });
    if (!r) return NextResponse.json({ error: "Gasto recurrente no encontrado" }, { status: 404 });
    if (!recurringAppliesTo(r, month)) {
      return NextResponse.json({ error: "Ese recurrente no corresponde a ese mes" }, { status: 400 });
    }

    const amount = parsed.data.amount ?? Number(r.amount);
    const exchangeRate = r.currency === "USD" ? parsed.data.exchangeRate ?? null : null;
    if (r.currency === "USD" && !exchangeRate) {
      return NextResponse.json({ error: "Un gasto en USD necesita la cotización (ARS por dólar)" }, { status: 400 });
    }

    const expense = await prisma.expense.create({
      data: {
        categoryId: r.categoryId,
        description: r.description,
        amount,
        currency: r.currency,
        exchangeRate,
        amountARS: round2(toARS(amount, r.currency, exchangeRate)),
        paidAt: parsed.data.paidAt ?? recurringDueDate(month, r.dayOfMonth),
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        method: r.method,
        notes: r.notes,
        recurringExpenseId: r.id,
        recurringPeriod: month,
        createdById: session.user.id,
      },
    });
    await logOperatorAction({
      userId: session.user.id,
      action: "EXPENSE_CREATED",
      entityType: "EXPENSE",
      entityId: expense.id,
      description: `Cargó el gasto #${expense.number} (recurrente)`,
      link: "/expenses",
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ese gasto ya está cargado para ese mes" }, { status: 409 });
    }
    log.error({ err: error }, "Error generating recurring expense");
    return NextResponse.json({ error: "No se pudo cargar el gasto" }, { status: 500 });
  }
}
