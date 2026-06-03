import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { calcTax } from "@/lib/utils";
import { logOperatorAction, notifyAdmins, escapeHtml } from "@/lib/notifications";
import { z } from "zod";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/quotes");

const quoteItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  discount: z.number().nonnegative().optional(),
  discountType: z.enum(["FIXED", "PERCENT"]).optional(),
});

const createQuoteSchema = z.object({
  contactId: z.string().min(1),
  items: z.array(quoteItemSchema).min(1),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  requiresFactura: z.boolean().optional(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const role = session.user.role as string;
    if (role !== "ADMIN" && role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
    }
    const quotes = await prisma.quote.findMany({
      take: 200,
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, company: true, email: true, address: true, city: true, state: true },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, category: true, sku: true },
            },
          },
        },
        user: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(quotes);
  } catch (error) {
    log.error({ err: error }, "Error fetching quotes");
    return NextResponse.json(
      { error: "Error fetching quotes" },
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
    const parsed = validateBody(createQuoteSchema, body);
    if (!parsed.success) return parsed.response;
    const { contactId, items, validUntil, notes, requiresFactura } = parsed.data;

    // Calculate per-item totals accounting for per-item discounts
    const processedItems = items.map(
      (item: { productId: string; quantity: number; unitPrice: number; discount?: number; discountType?: string }) => {
        const lineTotal = item.quantity * item.unitPrice;
        let discountAmount = 0;
        if (item.discount && item.discount > 0) {
          discountAmount = item.discountType === "PERCENT"
            ? lineTotal * (item.discount / 100)
            : item.discount;
        }
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          discountType: item.discountType || "FIXED",
          total: lineTotal - discountAmount,
        };
      }
    );

    const subtotal = processedItems.reduce((sum: number, i: { total: number }) => sum + i.total, 0);
    const tax = requiresFactura ? calcTax(subtotal) : 0;
    const total = subtotal + tax;

    const quote = await prisma.quote.create({
      data: {
        contactId,
        userId: session.user.id,
        subtotal,
        discount: 0,
        tax,
        total,
        requiresFactura: requiresFactura || false,
        validUntil: validUntil ? new Date(validUntil) : null,
        notes,
        items: {
          create: processedItems.map(
            (item: { productId: string; quantity: number; unitPrice: number; discount: number; discountType: string; total: number }) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount,
              discountType: item.discountType,
              total: item.total,
            })
          ),
        },
      },
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, company: true, email: true, address: true, city: true, state: true },
        },
        items: {
          include: { product: true },
        },
      },
    });

    const contactName = quote.contact.company || `${quote.contact.firstName} ${quote.contact.lastName}`.trim();
    const operatorName = session.user.name || "Operador";

    await logOperatorAction({
      userId: session.user.id,
      action: "QUOTE_CREATED",
      entityType: "QUOTE",
      entityId: quote.id,
      description: `Creó un presupuesto para "${contactName}" por $${total}`,
      link: "/quotes",
    });

    if (session.user.role === "OPERATOR") {
      await notifyAdmins({
        type: "QUOTE_CREATED",
        title: "Nuevo presupuesto creado",
        message: `<strong>${escapeHtml(operatorName)}</strong> creó un presupuesto para <strong>${escapeHtml(contactName)}</strong> por $${total}.`,
        link: "/quotes",
      });
    }

    return NextResponse.json(quote, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating quote");
    return NextResponse.json(
      { error: "Error creating quote" },
      { status: 500 }
    );
  }
}
