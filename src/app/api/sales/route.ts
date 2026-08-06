import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendNotification, escapeHtml, logOperatorAction, notifyAdmins } from "@/lib/notifications";
import { notifyNewPurchase } from "@/lib/client-portal";
import { calcTax } from "@/lib/utils";
import { z } from "zod";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/sales");

const saleItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  productUnitId: z.string().optional(),
});

const createSaleSchema = z.object({
  contactId: z.string().min(1),
  items: z.array(saleItemSchema).min(1),
  type: z.enum(["REGULAR", "CONSIGNMENT"]).default("REGULAR"),
  discount: z.number().nonnegative().default(0),
  notes: z.string().optional(),
  requiresFactura: z.boolean().default(false),
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const role = session.user.role as string;
    if (role !== "ADMIN" && role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};

    if (search) {
      where.contact = {
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { company: { contains: search } },
        ],
      };
    }

    const sales = await prisma.sale.findMany({
      where,
      take: 200,
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, company: true },
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
        payments: true,
        remito: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(sales);
  } catch (error) {
    log.error({ err: error }, "Error fetching sales");
    return NextResponse.json(
      { error: "Error fetching sales" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const role = session.user.role as string;
    if (role !== "ADMIN" && role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = validateBody(createSaleSchema, body);
    if (!parsed.success) return parsed.response;
    const { contactId, type, discount, notes, requiresFactura } = parsed.data;

    // A specific traced roll (productUnitId) is always exactly 1 unit —
    // ignore whatever quantity the client sent for those items.
    const items = parsed.data.items.map((item) =>
      item.productUnitId ? { ...item, quantity: 1 } : item
    );

    const subtotal = items.reduce(
      (sum: number, item: { quantity: number; unitPrice: number }) =>
        sum + item.quantity * item.unitPrice,
      0
    );
    const tax = requiresFactura ? calcTax(subtotal) : 0;
    const total = subtotal - discount + tax;

    const result = await prisma.$transaction(async (tx) => {
      // Validate any traced units (rollos) being sold: must exist, belong to
      // the right product, and not already be tied to another sale.
      for (const item of items) {
        if (!item.productUnitId) continue;
        const unit = await tx.productUnit.findUnique({
          where: { id: item.productUnitId },
          select: { productId: true, saleItem: { select: { id: true } } },
        });
        if (!unit || unit.productId !== item.productId) {
          throw new Error("La unidad seleccionada no corresponde a ese producto");
        }
        if (unit.saleItem) {
          throw new Error("Esa unidad ya está vendida en otra venta");
        }
      }

      // Create sale with items
      const sale = await tx.sale.create({
        data: {
          contactId,
          userId: session.user.id,
          type,
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
              productUnitId: item.productUnitId ?? null,
            })),
          },
        },
        include: {
          items: true,
          contact: true,
        },
      });

      // Auto-create remito
      await tx.remito.create({
        data: {
          saleId: sale.id,
        },
      });

      // Stock doesn't move and no warranty roll gets assigned here anymore —
      // that only happens when the sale is CONFIRMED (see confirmSale() in
      // src/lib/sales.ts). A PENDING sale reserves nothing; it's just a
      // record waiting to be confirmed once there's stock for it.

      // Auto-convert lead to client
      if (sale.contact.type === "LEAD") {
        await tx.contact.update({
          where: { id: contactId },
          data: { type: "CLIENT" },
        });
      }

      return sale;
    });

    const sale = await prisma.sale.findUnique({
      where: { id: result.id },
      include: {
        contact: { include: { assignedTo: { select: { id: true, name: true, email: true } } } },
        user: { select: { id: true, name: true } },
        items: {
          include: {
            product: true,
            warrantyRoll: { include: { installations: true } },
          },
        },
        remito: true,
        payments: true,
      },
    });

    const contactName = sale?.contact.company || `${sale?.contact.firstName} ${sale?.contact.lastName}`.trim() || "";
    const operatorName = session.user.name || "Operador";
    const wasConverted = result.contact.type === "LEAD";

    // Portal notification for the client (no-op for LEAD contacts, but the
    // conversion above already ran inside the same transaction, so this
    // still fires correctly on a lead's first purchase).
    await notifyNewPurchase(result.contactId, result.number, Number(result.total));

    // Notify the contact's assigned user about the sale
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
      userId: session.user.id,
      action: "SALE_CREATED",
      entityType: "SALE",
      entityId: result.id,
      description: `Registró una venta a "${contactName}" por $${result.total}`,
      link: "/sales",
    });

    if (wasConverted) {
      await logOperatorAction({
        userId: session.user.id,
        action: "LEAD_CONVERTED",
        entityType: "CLIENT",
        entityId: result.contactId,
        description: `Convirtió "${contactName}" de lead a cliente`,
        link: "/clients",
      });
    }

    if (session.user.role === "OPERATOR") {
      await notifyAdmins({
        type: "SALE_CREATED",
        title: "Nueva venta registrada",
        message: `<strong>${escapeHtml(operatorName)}</strong> registró una venta a <strong>${escapeHtml(contactName)}</strong> por $${result.total}${wasConverted ? " (lead convertido a cliente)" : ""}.`,
        link: "/sales",
      });
    }

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating sale");
    return NextResponse.json(
      { error: "Error creating sale" },
      { status: 500 }
    );
  }
}
