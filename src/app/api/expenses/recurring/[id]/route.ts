import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { recurringData, recurringSchema } from "@/lib/expense-input";

const log = createLogger("api/expenses/recurring/[id]");

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const { id } = await params;
  const parsed = validateBody(recurringSchema, await request.json().catch(() => null));
  if (!parsed.success) return parsed.response;

  try {
    const existing = await prisma.recurringExpense.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Gasto recurrente no encontrado" }, { status: 404 });
    const built = await recurringData(parsed.data);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
    const recurring = await prisma.recurringExpense.update({ where: { id }, data: built.data });
    await logOperatorAction({
      userId: session.user.id,
      action: "RECURRING_EXPENSE_UPDATED",
      entityType: "RECURRING_EXPENSE",
      entityId: id,
      description: "Editó un gasto recurrente",
      link: "/expenses",
    });
    return NextResponse.json(recurring);
  } catch (error) {
    log.error({ err: error }, "Error updating recurring expense");
    return NextResponse.json({ error: "No se pudo guardar el gasto recurrente" }, { status: 500 });
  }
}

/**
 * Borra la plantilla. Los gastos que ya generó quedan intactos (la relación es
 * onDelete: SetNull): borrar el recurrente no borra lo que ya se pagó.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const { id } = await params;
  try {
    const existing = await prisma.recurringExpense.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Gasto recurrente no encontrado" }, { status: 404 });
    await prisma.recurringExpense.delete({ where: { id } });
    await logOperatorAction({
      userId: session.user.id,
      action: "RECURRING_EXPENSE_DELETED",
      entityType: "RECURRING_EXPENSE",
      entityId: id,
      description: "Eliminó un gasto recurrente",
      link: "/expenses",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error deleting recurring expense");
    return NextResponse.json({ error: "No se pudo eliminar el gasto recurrente" }, { status: 500 });
  }
}
