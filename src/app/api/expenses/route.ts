import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { periodRange } from "@/lib/dashboard-periods";
import { isMonthKey } from "@/lib/expenses";
import { expenseData, expenseSchema } from "@/lib/expense-input";

const log = createLogger("api/expenses");

/**
 * Control de gastos — solo SUPERADMIN (ver canSeeExpenses en
 * src/lib/money-visibility.ts).
 *
 *   GET /api/expenses?from=2026-01&to=2026-10&categoryId=…&q=…
 *
 * Filtra por **fecha de pago**. Lo que un gasto con período pesa en cada mes lo
 * calcula el balance, no este listado.
 */
export async function GET(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const categoryId = searchParams.get("categoryId");
  const q = searchParams.get("q")?.trim();

  const paidAt: { gte?: Date; lt?: Date } = {};
  if (isMonthKey(from)) paidAt.gte = periodRange("month", from)!.from;
  if (isMonthKey(to)) paidAt.lt = periodRange("month", to)!.to;

  try {
    const expenses = await prisma.expense.findMany({
      where: {
        ...(paidAt.gte || paidAt.lt ? { paidAt } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(q
          ? {
              OR: [
                { description: { contains: q } },
                { supplierName: { contains: q } },
                { notes: { contains: q } },
                { supplier: { name: { contains: q } } },
              ],
            }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        receipts: { select: { id: true, fileName: true, mimeType: true, size: true } },
      },
      orderBy: [{ paidAt: "desc" }, { number: "desc" }],
      take: 1000,
    });
    return NextResponse.json(expenses);
  } catch (error) {
    log.error({ err: error }, "Error listing expenses");
    return NextResponse.json({ error: "No se pudieron cargar los gastos" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const parsed = validateBody(expenseSchema, await request.json().catch(() => null));
  if (!parsed.success) return parsed.response;

  try {
    const built = await expenseData(parsed.data);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

    const expense = await prisma.expense.create({
      data: { ...built.data, createdById: session.user.id },
    });
    // Sin montos en la descripción: la bitácora la ve ADMIN en Actividad Operadores.
    await logOperatorAction({
      userId: session.user.id,
      action: "EXPENSE_CREATED",
      entityType: "EXPENSE",
      entityId: expense.id,
      description: `Cargó el gasto #${expense.number}`,
      link: "/expenses",
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating expense");
    return NextResponse.json({ error: "No se pudo guardar el gasto" }, { status: 500 });
  }
}
