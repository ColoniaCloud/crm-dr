import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { isAdminRole } from "@/lib/utils";
const log = createLogger("api/clients/[id]");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const contact = await prisma.contact.findFirst({
      where: { id, type: "CLIENT" },
      include: {
        sales: {
          include: {
            items: { include: { product: { select: { id: true, name: true } } } },
            payments: true,
          },
          orderBy: { createdAt: "desc" },
        },
        payments: {
          include: { sale: { select: { number: true } } },
          orderBy: { paidAt: "desc" },
        },
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    // Calculate balance: sum of (sale.total - payments per sale)
    let balance = 0;
    const purchases = contact.sales.map((sale) => {
      const paidAmount = sale.payments.reduce((s, p) => s + Number(p.amount), 0);
      const saleTotal = Number(sale.total);
      balance += saleTotal - paidAmount;

      let paymentStatus = "PENDING";
      if (paidAmount >= saleTotal) paymentStatus = "PAID";
      else if (paidAmount > 0) paymentStatus = "PARTIAL";

      return {
        id: sale.id,
        saleNumber: `#${sale.number}`,
        total: saleTotal,
        paymentStatus,
        createdAt: sale.createdAt.toISOString(),
        items: sale.items.map((item) => ({
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
        })),
      };
    });

    const payments = contact.payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      method: p.method || "OTHER",
      date: p.paidAt.toISOString(),
      saleNumber: p.sale ? `#${p.sale.number}` : "—",
    }));

    // Parse suppliers as JSON array or fallback
    let suppliers: string[] = [];
    if (contact.currentSupplier) {
      try {
        const parsed = JSON.parse(contact.currentSupplier);
        suppliers = Array.isArray(parsed) ? parsed : [contact.currentSupplier];
      } catch {
        suppliers = contact.currentSupplier ? [contact.currentSupplier] : [];
      }
    }

    return NextResponse.json({
      id: contact.id,
      leadNumber: contact.leadNumber,
      firstName: contact.firstName,
      lastName: contact.lastName,
      name: `${contact.firstName} ${contact.lastName}`,
      company: contact.company,
      sector: contact.sector,
      email: contact.email,
      phone: contact.phone,
      whatsapp: contact.whatsapp,
      address: contact.address,
      city: contact.city,
      state: contact.state,
      cuit: contact.cuit,
      rut: null,
      website: contact.website,
      notes: contact.notes || "",
      suppliers,
      priceRange: contact.currentSupplierPrices || "",
      purchases,
      payments,
      balance,
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching client");
    return NextResponse.json({ error: "Error al cargar cliente" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    // Full edit mode (PUT-style) when contact fields are present
    const isFullEdit = body.firstName !== undefined || body.lastName !== undefined;

    if (isFullEdit) {
      const data: Record<string, unknown> = {};
      if (body.firstName !== undefined) data.firstName = body.firstName;
      if (body.lastName !== undefined) data.lastName = body.lastName;
      if (body.company !== undefined) data.company = body.company;
      if (body.email !== undefined) data.email = body.email;
      if (body.phone !== undefined) data.phone = body.phone;
      if (body.whatsapp !== undefined) data.whatsapp = body.whatsapp;
      if (body.address !== undefined) data.address = body.address;
      if (body.city !== undefined) data.city = body.city;
      if (body.state !== undefined) data.state = body.state;
      if (body.cuit !== undefined) data.cuit = body.cuit;
      if (body.website !== undefined) data.website = body.website;
      if (body.notes !== undefined) data.notes = body.notes;
      if (body.sector !== undefined) data.sector = body.sector;
      if (body.suppliers !== undefined) data.currentSupplier = JSON.stringify(body.suppliers);
      if (body.priceRange !== undefined) data.currentSupplierPrices = body.priceRange;

      const result = await prisma.contact.updateMany({
        where: { id, type: "CLIENT" },
        data,
      });

      if (result.count === 0) {
        return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
      }

      await logOperatorAction({ userId: session.user.id, action: "UPDATE_CLIENT", entityType: "CLIENT", entityId: id, description: `Editó cliente (edición completa)`, link: `/clients/${id}` });
      return NextResponse.json({ ok: true });
    }

    // Legacy partial update (notes, suppliers, priceRange only)
    const { notes, suppliers, priceRange } = body;

    const data: Record<string, unknown> = {};
    if (notes !== undefined) data.notes = notes;
    if (suppliers !== undefined) data.currentSupplier = JSON.stringify(suppliers);
    if (priceRange !== undefined) data.currentSupplierPrices = priceRange;

    const result = await prisma.contact.updateMany({
      where: { id, type: "CLIENT" },
      data,
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    await logOperatorAction({ userId: session.user.id, action: "UPDATE_CLIENT", entityType: "CLIENT", entityId: id, description: `Editó cliente (parcial)`, link: `/clients/${id}` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error updating client");
    return NextResponse.json({ error: "Error al actualizar cliente" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Solo administradores pueden eliminar clientes" }, { status: 403 });
  }

  try {
    const existing = await prisma.contact.findFirst({
      where: { id, type: "CLIENT" },
      select: { id: true, firstName: true, lastName: true, company: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const deletedName = existing.company || `${existing.firstName} ${existing.lastName}`.trim();

    // Delete all child records in correct order within a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Payments (FK to sale + contact, no cascade)
      await tx.payment.deleteMany({ where: { contactId: id } });
      // 2. Remitos (FK to sale, no cascade) — get sale IDs first
      const saleIds = (await tx.sale.findMany({ where: { contactId: id }, select: { id: true } })).map((s) => s.id);
      if (saleIds.length > 0) {
        await tx.remito.deleteMany({ where: { saleId: { in: saleIds } } });
        await tx.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
      }
      // 3. Sales (FK to contact, no cascade)
      await tx.sale.deleteMany({ where: { contactId: id } });
      // 4. Quote items then quotes (FK to contact, no cascade)
      const quoteIds = (await tx.quote.findMany({ where: { contactId: id }, select: { id: true } })).map((q) => q.id);
      if (quoteIds.length > 0) {
        await tx.quoteItem.deleteMany({ where: { quoteId: { in: quoteIds } } });
      }
      await tx.quote.deleteMany({ where: { contactId: id } });
      // 5. Visits, calls, tags, activities (have cascade but deleteMany skips it)
      await tx.visit.deleteMany({ where: { contactId: id } });
      await tx.call.deleteMany({ where: { contactId: id } });
      await tx.contactTag.deleteMany({ where: { contactId: id } });
      await tx.activityLog.deleteMany({ where: { contactId: id } });
      await tx.leadActivity.deleteMany({ where: { contactId: id } });
      // 6. Finally delete the contact
      await tx.contact.delete({ where: { id } });
    });

    await logOperatorAction({ userId: session.user.id, action: "DELETE_CLIENT", entityType: "CLIENT", entityId: id, description: `Eliminó cliente "${deletedName}"` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error deleting client");
    return NextResponse.json(
      { error: "Error al eliminar cliente" },
      { status: 500 }
    );
  }
}
