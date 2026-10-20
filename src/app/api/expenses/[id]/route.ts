import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { expenseData, expenseSchema } from "@/lib/expense-input";

const log = createLogger("api/expenses/[id]");

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const { id } = await params;
  const parsed = validateBody(expenseSchema, await request.json().catch(() => null));
  if (!parsed.success) return parsed.response;

  try {
    const existing = await prisma.expense.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });

    const built = await expenseData(parsed.data);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

    const expense = await prisma.expense.update({ where: { id }, data: built.data });
    await logOperatorAction({
      userId: session.user.id,
      action: "EXPENSE_UPDATED",
      entityType: "EXPENSE",
      entityId: id,
      description: `Editó el gasto #${expense.number}`,
      link: "/expenses",
    });
    return NextResponse.json(expense);
  } catch (error) {
    log.error({ err: error }, "Error updating expense");
    return NextResponse.json({ error: "No se pudo guardar el gasto" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const { id } = await params;
  try {
    const existing = await prisma.expense.findUnique({ where: { id }, select: { number: true } });
    if (!existing) return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });

    // Los comprobantes caen en cascada (onDelete: Cascade).
    await prisma.expense.delete({ where: { id } });
    await logOperatorAction({
      userId: session.user.id,
      action: "EXPENSE_DELETED",
      entityType: "EXPENSE",
      entityId: id,
      description: `Eliminó el gasto #${existing.number}`,
      link: "/expenses",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error deleting expense");
    return NextResponse.json({ error: "No se pudo eliminar el gasto" }, { status: 500 });
  }
}
