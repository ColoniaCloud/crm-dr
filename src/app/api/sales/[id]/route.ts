import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction, ensurePaymentAuditTable } from "@/lib/notifications";
import { linkRollToSaleItem } from "@/lib/warranty";

const log = createLogger("api/sales/[id]");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            email: true,
            phone: true,
            cuit: true,
            type: true,
          },
        },
        user: {
          select: { id: true, name: true },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, category: true, sku: true },
            },
          },
        },
        payments: {
          orderBy: { paidAt: "desc" },
        },
        remito: true,
      },
    });

    if (!sale) {
      return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
    }

    return NextResponse.json(sale);
  } catch (error) {
    log.error({ err: error }, "Error fetching sale");
    return NextResponse.json({ error: "Error al obtener venta" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.sale.findUnique({
      where: { id },
      include: {
        items: true,
        contact: { select: { firstName: true, lastName: true, company: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const { status, ...rest } = body as { status?: string; [key: string]: unknown };

    const updated = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.update({
        where: { id },
        data: { ...(status ? { status: status as Prisma.SaleUpdateInput["status"] } : {}), ...rest },
        include: { items: true },
      });

      // Assign warranty rolls FIFO when sale transitions to CONFIRMED
      if (status === "CONFIRMED" && existing.status !== "CONFIRMED") {
        for (const item of existing.items) {
          await linkRollToSaleItem(tx, item.id, item.productId);
        }
      }

      return sale;
    });

    const cName =
      existing.contact.company ||
      `${existing.contact.firstName} ${existing.contact.lastName}`.trim();
    await logOperatorAction({
      userId: session.user.id,
      action: "UPDATE_SALE",
      entityType: "SALE",
      entityId: id,
      description: `Actualizó venta #${existing.number} de "${cName}"${status ? ` → ${status}` : ""}`,
      link: `/sales/${id}`,
    });

    return NextResponse.json(updated);
  } catch (error) {
    log.error({ err: error }, "Error updating sale");
    return NextResponse.json({ error: "Error al actualizar venta" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Solo SUPERADMIN puede editar el total de una venta" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.sale.findUnique({
      where: { id },
      include: { contact: { select: { firstName: true, lastName: true, company: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const { total, subtotal, discount, tax, reason } = body as {
      total: number;
      subtotal?: number;
      discount?: number;
      tax?: number;
      reason?: string;
    };

    if (typeof total !== "number" || total < 0) {
      return NextResponse.json({ error: "El total debe ser un número positivo" }, { status: 400 });
    }

    const oldValues = {
      total: Number(existing.total),
      subtotal: Number(existing.subtotal),
      discount: Number(existing.discount),
      tax: Number(existing.tax),
    };
    const newValues = {
      total,
      subtotal: subtotal ?? oldValues.subtotal,
      discount: discount ?? oldValues.discount,
      tax: tax ?? oldValues.tax,
    };

    const updated = await prisma.sale.update({
      where: { id },
      data: {
        total: new Prisma.Decimal(total),
        ...(subtotal !== undefined && { subtotal: new Prisma.Decimal(subtotal) }),
        ...(discount !== undefined && { discount: new Prisma.Decimal(discount) }),
        ...(tax !== undefined && { tax: new Prisma.Decimal(tax) }),
      },
    });

    const contactName =
      existing.contact.company ||
      `${existing.contact.firstName} ${existing.contact.lastName}`.trim();
    const auditDesc = `Editó total de venta #${existing.number} de "${contactName}": $${oldValues.total} → $${total}${reason ? ` (Motivo: ${reason})` : ""}`;

    await ensurePaymentAuditTable();
    const auditId = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO payment_audit_logs (id, saleId, paymentId, userId, action, oldValues, newValues, description, createdAt)
      VALUES (
        ${auditId},
        ${id},
        NULL,
        ${session.user.id},
        'EDITED',
        ${JSON.stringify({ ...oldValues, reason: null })},
        ${JSON.stringify({ ...newValues, reason: reason ?? null })},
        ${auditDesc},
        NOW(3)
      )
    `;

    await logOperatorAction({
      userId: session.user.id,
      action: "EDIT_SALE_TOTAL",
      entityType: "SALE",
      entityId: id,
      description: auditDesc,
      link: `/sales/${id}`,
    });

    return NextResponse.json(updated);
  } catch (error) {
    log.error({ err: error }, "Error updating sale total");
    return NextResponse.json({ error: "Error al actualizar el total de la venta" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Solo SUPERADMIN puede eliminar ventas" }, { status: 403 });
    }

    const { id } = await params;

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { contact: { select: { firstName: true, lastName: true, company: true } } },
    });

    if (!sale) {
      return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
    }

    await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
      // Restore stock for each item before deleting
      const saleItems = await tx.saleItem.findMany({ where: { saleId: id } });
      for (const item of saleItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product) {
          const stockBefore = product.stock;
          const stockAfter = stockBefore + item.quantity;
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: stockAfter },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: "DEVOLUCION",
              quantity: item.quantity,
              stockBefore,
              stockAfter,
              referenceId: id,
              referenceType: "SALE",
              reason: `Venta #${sale.number} eliminada`,
              userId: session.user.id,
            },
          });
        }
      }
      await tx.payment.deleteMany({ where: { saleId: id } });
      await tx.remito.deleteMany({ where: { saleId: id } });
      await tx.saleItem.deleteMany({ where: { saleId: id } });
      await tx.sale.delete({ where: { id } });
    });

    const cName = sale.contact.company || `${sale.contact.firstName} ${sale.contact.lastName}`.trim();
    await logOperatorAction({ userId: session.user.id, action: "DELETE_SALE", entityType: "SALE", entityId: id, description: `Eliminó venta de "${cName}"` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error deleting sale");
    return NextResponse.json({ error: "Error al eliminar venta" }, { status: 500 });
  }
}
