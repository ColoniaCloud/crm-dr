import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
const log = createLogger("api/quotes/[id]");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;

  try {
    const { id } = await params;

    const quote = await prisma.quote.findUnique({
      where: { id },
      include: {
        contact: true,
        user: { select: { id: true, name: true, email: true } },
        items: {
          include: { product: true },
        },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    return NextResponse.json(quote);
  } catch (error) {
    log.error({ err: error }, "Error fetching quote");
    return NextResponse.json(
      { error: "Error fetching quote" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id } = await params;
    const body = await request.json();
    const { items, ...quoteData } = body;

    if (items) {
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

      const subtotal = processedItems.reduce(
        (sum: number, item: { total: number }) => sum + item.total,
        0
      );
      const tax = Number(quoteData.tax ?? 0);
      const total = subtotal + tax;

      // Delete existing items and recreate
      await prisma.quoteItem.deleteMany({ where: { quoteId: id } });

      const quote = await prisma.quote.update({
        where: { id },
        data: {
          ...quoteData,
          subtotal,
          discount: quoteData.discount ?? 0,
          total,
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
          contact: true,
          items: { include: { product: true } },
        },
      });

      const cName = quote.contact.company || `${quote.contact.firstName} ${quote.contact.lastName}`.trim();
      await logOperatorAction({ userId: session.user.id, action: "UPDATE_QUOTE", entityType: "QUOTE", entityId: id, description: `Actualizó presupuesto #${quote.number} de "${cName}"`, link: `/quotes/${id}` });
      return NextResponse.json(quote);
    }

    const quote = await prisma.quote.update({
      where: { id },
      data: quoteData,
      include: {
        contact: true,
        items: { include: { product: true } },
      },
    });

    return NextResponse.json(quote);
  } catch (error) {
    log.error({ err: error }, "Error updating quote");
    return NextResponse.json(
      { error: "Error updating quote" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id } = await params;
    const body = await request.json();

    if (body.action !== "convert") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const quote = await prisma.quote.findUnique({
      where: { id },
      include: {
        contact: true,
        items: { include: { product: true } },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    if (quote.status === "CONVERTED") {
      return NextResponse.json(
        { error: "Quote already converted" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // a. Create a Sale from the quote data
      const sale = await tx.sale.create({
        data: {
          contactId: quote.contactId,
          userId: quote.userId,
          requiresFactura: quote.requiresFactura,
          subtotal: quote.subtotal,
          discount: quote.discount,
          tax: quote.tax,
          total: quote.total,
          notes: quote.notes,
          items: {
            // b. Create SaleItems from QuoteItems
            create: quote.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      // c. Create a Remito for the sale
      await tx.remito.create({
        data: {
          saleId: sale.id,
        },
      });

      // d. Stock doesn't move here — the Sale is created PENDING, same as
      // every other creation path. It only moves (and warranty rolls get
      // assigned) when the sale is CONFIRMED, via confirmSale() in
      // src/lib/sales.ts. This also fixes a pre-existing gap: sales created
      // this way never used to get a warranty roll linked at all.

      // e. Convert the contact from LEAD to CLIENT if they're a LEAD
      if (quote.contact.type === "LEAD") {
        await tx.contact.update({
          where: { id: quote.contactId },
          data: { type: "CLIENT" },
        });
      }

      // f. Update quote status to CONVERTED and set convertedToSaleId
      const updatedQuote = await tx.quote.update({
        where: { id },
        data: {
          status: "CONVERTED",
          convertedToSaleId: sale.id,
        },
      });

      return { sale, quote: updatedQuote };
    });

    const cName = quote.contact.company || `${quote.contact.firstName} ${quote.contact.lastName}`.trim();
    await logOperatorAction({ userId: session.user.id, action: "CONVERT_QUOTE", entityType: "QUOTE", entityId: id, description: `Convirtió presupuesto #${quote.number} de "${cName}" a venta`, link: `/sales/${result.sale.id}` });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error converting quote");
    return NextResponse.json(
      { error: "Error converting quote to sale" },
      { status: 500 }
    );
  }
}
