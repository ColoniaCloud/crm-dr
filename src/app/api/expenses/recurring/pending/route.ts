import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { isMonthKey, monthKeyOf, recurringAppliesTo, recurringDueDate } from "@/lib/expenses";

const log = createLogger("api/expenses/recurring/pending");

/**
 * Los recurrentes que corresponden a `month` y todavía no se cargaron.
 *
 *   GET /api/expenses/recurring/pending?month=2026-10   (default: el mes actual)
 *
 * No crea nada: la pantalla los muestra como sugerencias y cargarlos es un clic
 * (POST /api/expenses/recurring/:id/generate).
 */
export async function GET(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  const param = new URL(request.url).searchParams.get("month");
  const month = isMonthKey(param) ? param : monthKeyOf(new Date());

  try {
    const recurring = await prisma.recurringExpense.findMany({
      where: { active: true, startMonth: { lte: month } },
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        expenses: { where: { recurringPeriod: month }, select: { id: true } },
      },
      orderBy: { description: "asc" },
    });
    const pending = recurring
      .filter((r) => recurringAppliesTo(r, month) && r.expenses.length === 0)
      .map(({ expenses: _e, ...r }) => ({ ...r, month, dueDate: recurringDueDate(month, r.dayOfMonth) }));
    return NextResponse.json({ month, pending });
  } catch (error) {
    log.error({ err: error }, "Error listing pending recurring expenses");
    return NextResponse.json({ error: "No se pudieron cargar los gastos pendientes" }, { status: 500 });
  }
}
