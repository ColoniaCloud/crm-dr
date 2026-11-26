import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { ensurePaymentAuditTable, logOperatorAction } from "@/lib/notifications";
import { rebuildAllocations, round2, toCents } from "@/lib/account";
import { getSaleBalance, lockSale } from "@/lib/payments";

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

    // Una fecha que no se puede leer daba un 500; una futura dejaba un pago
    // "hecho" que todavía no pasó y desordenaba la imputación FIFO a cuotas.
    let nuevaFecha = existing.paidAt;
    if (paidAt) {
      nuevaFecha = new Date(paidAt);
      if (Number.isNaN(nuevaFecha.getTime())) {
        return NextResponse.json({ error: "La fecha del pago no es válida" }, { status: 400 });
      }
      if (nuevaFecha.getTime() > Date.now() + 60 * 60 * 1000) {
        return NextResponse.json({ error: "La fecha del pago no puede ser futura" }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      await lockSale(tx, existing.sale.id);

      // Subir el monto tiene el mismo tope que cobrar: el saldo de la venta
      // con este pago sacado. Antes no había ninguno.
      if (toCents(amount) > toCents(Number(existing.amount))) {
        const balance = await getSaleBalance(existing.sale.id, tx);
        const disponible = round2((balance?.remaining ?? 0) + Number(existing.amount));
        if (toCents(amount) > toCents(disponible)) {
          return {
            ok: false as const,
            error: `Con este pago, el saldo de la venta #${existing.sale.number} admite como máximo $${disponible.toLocaleString("es-AR")}.`,
          };
        }
      }

      const payment = await tx.payment.update({
        where: { id },
        data: {
          amount: new Prisma.Decimal(amount),
          method: method ?? existing.method,
          reference: reference !== undefined ? reference : existing.reference,
          notes: notes !== undefined ? notes : existing.notes,
          paidAt: nuevaFecha,
        },
      });

      // El monto o la fecha pueden haber cambiado, así que las imputaciones a
      // cuotas se recalculan enteras (la función es idempotente).
      await rebuildAllocations(existing.sale.id, tx);
      return { ok: true as const, payment };
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    const updated = result.payment;

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

    // Al desaparecer el pago, sus imputaciones se van por cascada; el rebuild
    // recorre los pagos que quedaron y vuelve a llenar las cuotas desde cero.
    await prisma.$transaction(async (tx) => {
      await lockSale(tx, existing.sale.id);
      await tx.payment.delete({ where: { id } });
      await rebuildAllocations(existing.sale.id, tx);
    });

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
