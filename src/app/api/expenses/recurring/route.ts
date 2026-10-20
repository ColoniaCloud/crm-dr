import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { recurringData, recurringSchema } from "@/lib/expense-input";

const log = createLogger("api/expenses/recurring");

/** Plantillas de gastos mensuales (alquiler, sueldos, abonos). */
export async function GET() {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  try {
    const recurring = await prisma.recurringExpense.findMany({
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        expenses: { select: { recurringPeriod: true }, orderBy: { recurringPeriod: "desc" }, take: 1 },
      },
      orderBy: [{ active: "desc" }, { description: "asc" }],
    });
    return NextResponse.json(
      recurring.map(({ expenses, ...r }) => ({ ...r, lastGeneratedMonth: expenses[0]?.recurringPeriod ?? null }))
    );
  } catch (error) {
    log.error({ err: error }, "Error listing recurring expenses");
    return NextResponse.json({ error: "No se pudieron cargar los gastos recurrentes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const parsed = validateBody(recurringSchema, await request.json().catch(() => null));
  if (!parsed.success) return parsed.response;

  try {
    const built = await recurringData(parsed.data);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
    const recurring = await prisma.recurringExpense.create({
      data: { ...built.data, createdById: session.user.id },
    });
    await logOperatorAction({
      userId: session.user.id,
      action: "RECURRING_EXPENSE_CREATED",
      entityType: "RECURRING_EXPENSE",
      entityId: recurring.id,
      description: "Creó un gasto recurrente",
      link: "/expenses",
    });
    return NextResponse.json(recurring, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating recurring expense");
    return NextResponse.json({ error: "No se pudo guardar el gasto recurrente" }, { status: 500 });
  }
}
