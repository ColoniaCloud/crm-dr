import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { sendNotification, escapeHtml, logOperatorAction, notifyAdmins } from "@/lib/notifications";
import { confirmSale } from "@/lib/sales";
import { notifyNewPurchase } from "@/lib/client-portal";
import { calcTax } from "@/lib/utils";
import { validateBody } from "@/lib/api-validation";
import { serializeSaleDetail } from "@/lib/mobile-sale";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mobile/v1/sales");

const saleItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

const createSaleSchema = z.object({
  contactId: z.string().min(1),
  items: z.array(saleItemSchema).min(1),
  discount: z.number().nonnegative().default(0),
  notes: z.string().optional(),
  requiresFactura: z.boolean().default(false),
  taxId: z.string().optional(), // RUT/CUIT/CUIL, only relevant when requiresFactura is true
});

export function OPTIONS() {
  return mobileCorsPreflight();
}

// Recent sales, newest first — feeds the "Consultar venta" screen.
export async function GET(request: Request) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get("contactId") || undefined;

    const sales = await prisma.sale.findMany({
      where: contactId ? { contactId } : undefined,
      take: 50,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, company: true } },
        items: { select: { id: true, quantity: true } },
        payments: { select: { amount: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = sales.map((sale) => {
      const totalPaid = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      return {
        id: sale.id,
        number: sale.number,
        contactName:
          sale.contact.company || `${sale.contact.firstName} ${sale.contact.lastName}`.trim(),
        total: Number(sale.total),
        totalPaid,
        remaining: Number(sale.total) - totalPaid,
        itemsCount: sale.items.length,
        createdAt: sale.createdAt.toISOString(),
      };
    });

    return withMobileCors(NextResponse.json({ sales: formatted }));
  } catch (error) {
    log.error({ err: error }, "Error fetching sales");
    return withMobileCors(NextResponse.json({ error: "Error al buscar ventas" }, { status: 500 }));
  }
}

export async function POST(request: Request) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);
  const { sub: userId, name: operatorName, role } = gate.user;

  const json = await request.json().catch(() => null);
  const validation = validateBody(createSaleSchema, json);
  if (!validation.success) return withMobileCors(validation.response);
  const { contactId, items, discount, notes, requiresFactura, taxId } = validation.data;

  try {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const tax = requiresFactura ? calcTax(subtotal) : 0;
    const total = subtotal - discount + tax;

    const result = await prisma.$transaction(async (tx) => {
      // If invoicing was requested and a tax id was captured on the spot,
      // keep the contact's record up to date (same free-text `cuit` field
      // the dashboard's sale form reads from/writes to).
      if (requiresFactura && taxId) {
        await tx.contact.update({ where: { id: contactId }, data: { cuit: taxId } });
      }

      const sale = await tx.sale.create({
        data: {
          contactId,
          userId,
          requiresFactura,
          subtotal,
          discount,
          tax,
          total,
          notes,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.quantity * item.unitPrice,
            })),
          },
        },
        include: { items: true, contact: true },
      });

      await tx.remito.create({ data: { saleId: sale.id } });

      // A point-of-sale transaction is final the moment it's entered — there's
      // no "confirm later" step at a physical register, unlike the desktop
      // CRM's PENDING sales. So this creates AND confirms in the same
      // transaction, which is what actually moves stock and assigns the
      // warranty roll. If stock is short, the whole sale fails to create
      // (same behavior as before this change).
      await confirmSale(tx, sale.id, userId, " (app móvil)");

      if (sale.contact.type === "LEAD") {
        await tx.contact.update({ where: { id: contactId }, data: { type: "CLIENT" } });
      }

      return sale;
    });

    const sale = await prisma.sale.findUnique({
      where: { id: result.id },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            cuit: true,
            type: true,
            assignedTo: { select: { id: true, name: true, email: true } },
          },
        },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        remito: true,
        payments: true,
      },
    });

    const contactName =
      sale?.contact.company || `${sale?.contact.firstName} ${sale?.contact.lastName}`.trim() || "";
    const wasConverted = result.contact.type === "LEAD";

    await notifyNewPurchase(result.contactId, result.number, Number(result.total));

    if (sale?.contact.assignedTo) {
      await sendNotification({
        userId: sale.contact.assignedTo.id,
        userEmail: sale.contact.assignedTo.email!,
        userName: sale.contact.assignedTo.name,
        type: "SALE_CREATED",
        title: "Nueva venta registrada",
        message: `Se registró una venta a <strong>${escapeHtml(contactName)}</strong> por $${sale.total}.`,
        link: "/sales",
      });
    }

    await logOperatorAction({
      userId,
      action: "SALE_CREATED",
      entityType: "SALE",
      entityId: result.id,
      description: `Registró una venta a "${contactName}" por $${result.total} (app móvil)`,
      link: "/sales",
    });

    if (wasConverted) {
      await logOperatorAction({
        userId,
        action: "LEAD_CONVERTED",
        entityType: "CLIENT",
        entityId: result.contactId,
        description: `Convirtió "${contactName}" de lead a cliente (app móvil)`,
        link: "/clients",
      });
    }

    if (role === "OPERATOR") {
      await notifyAdmins({
        type: "SALE_CREATED",
        title: "Nueva venta registrada",
        message: `<strong>${escapeHtml(operatorName)}</strong> registró una venta a <strong>${escapeHtml(contactName)}</strong> por $${result.total} desde la app móvil${wasConverted ? " (lead convertido a cliente)" : ""}.`,
        link: "/sales",
      });
    }

    return withMobileCors(NextResponse.json({ sale: serializeSaleDetail(sale!) }, { status: 201 }));
  } catch (error) {
    log.error({ err: error }, "Error creating sale");
    const message = error instanceof Error ? error.message : "Error al crear la venta";
    return withMobileCors(NextResponse.json({ error: message }, { status: 400 }));
  }
}
