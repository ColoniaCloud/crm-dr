import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { ensurePaymentAuditTable, logOperatorAction } from "@/lib/notifications";

const log = createLogger("api/payments/[id]");

const updatePaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["CASH", "TRANSFER", "CHECK", "CARD", "OTHER"]).optional().nullable(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  paidAt: z.string().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Solo superadmin puede editar pagos" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.payment.findUnique({
      where: { id },
      include: {
        sale: { select: { id: true, number: true } },
        contact: { select: { firstName: true, lastName: true, company: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = validateBody(updatePaymentSchema, body);
    if (!parsed.success) return parsed.response;
    const { amount, method, reference, notes, paidAt } = parsed.data;

    const oldValues = {
      amount: Number(existing.amount),
      method: existing.method,
      reference: existing.reference,
      notes: existing.notes,
      paidAt: existing.paidAt.toISOString(),
    };
    const newValues = {
      amount,
      method: method ?? existing.method,
      reference: reference ?? existing.reference,
      notes: notes ?? existing.notes,
      paidAt: paidAt ?? existing.paidAt.toISOString(),
    };

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        amount: new Prisma.Decimal(amount),
        method: method ?? existing.method,
        reference: reference !== undefined ? reference : existing.reference,
        notes: notes !== undefined ? notes : existing.notes,
        paidAt: paidAt ? new Date(paidAt) : existing.paidAt,
      },
    });

    const contactName =
      existing.contact.company ||
      `${existing.contact.firstName} ${existing.contact.lastName}`.trim();
    const changes: string[] = [];
    if (oldValues.amount !== newValues.amount)
      changes.push(`monto $${oldValues.amount} → $${newValues.amount}`);
    if (oldValues.method !== newValues.method)
      changes.push(`método ${oldValues.method} → ${newValues.method}`);
    if (oldValues.reference !== newValues.reference)
      changes.push(`referencia actualizada`);
    if (oldValues.notes !== newValues.notes)
      changes.push(`notas actualizadas`);

    await ensurePaymentAuditTable();
    const auditId = crypto.randomUUID();
    const auditDesc = `Editó pago de "${contactName}" (Venta #${existing.sale.number}): ${changes.join(", ") || "sin cambios"}`;
    await prisma.$executeRaw`
      INSERT INTO payment_audit_logs (id, saleId, paymentId, userId, action, oldValues, newValues, description, createdAt)
      VALUES (
        ${auditId},
        ${existing.sale.id},
        ${id},
        ${session.user.id},
        'EDITED',
        ${JSON.stringify(oldValues)},
        ${JSON.stringify(newValues)},
        ${auditDesc},
        NOW(3)
      )
    `;

    await logOperatorAction({
      userId: session.user.id,
      action: "EDIT_PAYMENT",
      entityType: "PAYMENT",
      entityId: id,
      description: auditDesc,
      link: `/sales/${existing.sale.id}`,
    });

    return NextResponse.json(updated);
  } catch (error) {
    log.error({ err: error }, "Error updating payment");
    return NextResponse.json({ error: "Error al actualizar pago" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Solo superadmin puede eliminar pagos" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.payment.findUnique({
      where: { id },
      include: {
        sale: { select: { id: true, number: true } },
        contact: { select: { firstName: true, lastName: true, company: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
    }

    const contactName =
      existing.contact.company ||
      `${existing.contact.firstName} ${existing.contact.lastName}`.trim();
    const auditDesc = `Eliminó pago de "${contactName}" (Venta #${existing.sale.number}) por $${Number(existing.amount)}`;
    const oldValues = {
      amount: Number(existing.amount),
      method: existing.method,
      reference: existing.reference,
      notes: existing.notes,
      paidAt: existing.paidAt.toISOString(),
    };

    // Create audit log BEFORE deleting (FK on paymentId will become NULL on delete due to ON DELETE SET NULL)
    await ensurePaymentAuditTable();
    const auditId = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO payment_audit_logs (id, saleId, paymentId, userId, action, oldValues, newValues, description, createdAt)
      VALUES (
        ${auditId},
        ${existing.sale.id},
        ${id},
        ${session.user.id},
        'DELETED',
        ${JSON.stringify(oldValues)},
        NULL,
        ${auditDesc},
        NOW(3)
      )
    `;

    await prisma.payment.delete({ where: { id } });

    await logOperatorAction({
      userId: session.user.id,
      action: "DELETE_PAYMENT",
      entityType: "PAYMENT",
      entityId: id,
      description: auditDesc,
      link: `/sales/${existing.sale.id}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error deleting payment");
    return NextResponse.json({ error: "Error al eliminar pago" }, { status: 500 });
  }
}
