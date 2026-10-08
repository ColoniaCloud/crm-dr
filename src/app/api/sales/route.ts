import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendNotification, escapeHtml, logOperatorAction, notifyAdmins } from "@/lib/notifications";
import { notifyNewPurchase } from "@/lib/client-portal";
import { checkConsignmentCredit } from "@/lib/credit";
import { resolveSaleDiscount } from "@/lib/discount-tags";
import { confirmSale } from "@/lib/sales";
import { avisarFacturaPendiente } from "@/lib/factura-notify";
import { z } from "zod";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/sales");

/** confirmSale no pudo descontar: la venta no se crea, y la pantalla ofrece guardarla pendiente. */
class StockInsuficiente extends Error {}

const saleItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  productUnitId: z.string().optional(),
  /**
   * La etiqueta de descuento de ESTA línea, cuando quien vende la cambió a mano.
   *
   * Omitirla es lo normal: entonces manda el acuerdo pactado del contacto. `null`
   * explícito es distinto de omitirla — es "Sin descuento" pisando una etiqueta
   * que sí correspondía. Las dos cosas las distingue `resolveSaleDiscount`.
   */
  discountTagId: z.string().nullish(),
});

const createSaleSchema = z.object({
  contactId: z.string().min(1),
  items: z.array(saleItemSchema).min(1),
  type: z.enum(["REGULAR", "CONSIGNMENT"]).default("REGULAR"),
  discount: z.number().nonnegative().default(0),
  notes: z.string().optional(),
  requiresFactura: z.boolean().default(false),
  /**
   * Qué hacer con la venta además de crearla, todo en la misma transacción:
   * - `save`: queda PENDING, no mueve stock (la venta sin stock, o la que se
   *   confirma después). Es el default para que quien no lo mande —conversión
   *   de presupuestos, scripts— siga igual que antes.
   * - `confirm`: la confirma (descuenta stock, asigna rollos).
   * - `deliver`: la confirma y la marca entregada. El remito queda SIN firmar:
   *   firmar es un paso aparte, con su propia ruta.
   *
   * Va en el mismo request y no como un PUT después a propósito: si el segundo
   * paso fallaba (falta de stock) quedaba creada una venta PENDING que el
   * operador no pidió.
   */
  action: z.enum(["save", "confirm", "deliver"]).default("save"),
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
    // `discount` del body es la concesion que cargo a mano quien vende. El
    // descuento de la etiqueta del contacto lo calcula el servidor mas abajo y
    // se suma a este — ver src/lib/discount-tags.ts.
    const { contactId, type, discount: manualDiscount, notes, requiresFactura, action } = parsed.data;

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
    // Read-only, antes de abrir la transaccion (igual que el gate de credito).
    //
    // `allowOverride: true` sin chequear el rol porque esta ruta ya es ADMIN+
    // (arriba): nadie por debajo de ADMIN llega a este formulario. La que sí
    // tiene que chequearlo es /api/mobile/v1/sales, que acepta OPERATOR.
    const resolved = await resolveSaleDiscount(
      contactId,
      items.map((item) => ({
        productId: item.productId,
        total: item.quantity * item.unitPrice,
        discountTagId: item.discountTagId,
      })),
      manualDiscount,
      { allowOverride: true }
    );
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    const { discount, tagDiscount, discountTagId, discountTagLabel } = resolved;
    // Sin IVA encima: el precio de lista YA lo incluye, asi que sumarle un 21%
    // a la venta que pedia factura lo cobraba dos veces. El total es el mismo
    // lleve factura o no, y la factura se emite aparte por ese mismo total.
    // `requiresFactura` se sigue guardando porque es lo que dispara el
    // recordatorio a quien factura (src/lib/factura-notify.ts) al confirmarse
    // la venta, y lo que decide el texto del remito.
    const tax = 0;
    const total = subtotal - discount;

    if (type === "CONSIGNMENT") {
      const credit = await checkConsignmentCredit(contactId, total);
      if (!credit.ok) {
        return NextResponse.json(
          { error: credit.error, code: credit.code, balance: credit.balance, limit: credit.limit },
          { status: 400 }
        );
      }
    }

    // Productos con garantía que se quedaron sin rollo al confirmar.
    let sinRollo: string[] = [];

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
          tagDiscount,
          discountTagId,
          discountTagLabel,
          tax,
          total,
          notes,
          items: {
            // `resolved.lines` viene en el mismo orden que `items` — por indice y
            // no por productId, porque una venta puede repetir el mismo producto
            // en dos lineas (dos rollos trazados del mismo SKU, por ejemplo).
            create: items.map((item, i) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.quantity * item.unitPrice,
              productUnitId: item.productUnitId ?? null,
              discountTagId: resolved.lines[i].discountTagId,
              discountTagLabel: resolved.lines[i].discountTagLabel,
              tagDiscount: resolved.lines[i].tagDiscount,
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

      // Stock only moves and warranty rolls only get assigned when the sale is
      // CONFIRMED (confirmSale() in src/lib/sales.ts). With `save` it stays
      // PENDING and reserves nothing; with `confirm`/`deliver` it's confirmed
      // here, and if stock is short the whole transaction rolls back — the
      // sale isn't created at all.
      if (action !== "save") {
        try {
          ({ sinRollo } = await confirmSale(tx, sale.id, session.user.id));
        } catch (err) {
          const message = err instanceof Error ? err.message : "";
          if (message.startsWith("Stock insuficiente")) throw new StockInsuficiente(message);
          throw err;
        }
        if (action === "deliver") {
          await tx.sale.update({ where: { id: sale.id }, data: { status: "DELIVERED" } });
        }
      }

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

    // Lo mismo que hace la confirmación desde la ficha (sales/[id]/route.ts),
    // después del commit: el aviso a quien factura y el de venta sin rollo.
    if (action !== "save" && requiresFactura) {
      await avisarFacturaPendiente(result.id);
    }
    if (sinRollo.length > 0) {
      await notifyAdmins({
        type: "SALE_WITHOUT_ROLL",
        title: "Una venta quedó sin rollo de garantía",
        message:
          `La venta #${result.number} de "${contactName}" se confirmó, pero no había rollos libres de: ` +
          `${sinRollo.join(", ")}. El Cliente no va a ver esos rollos en su panel. ` +
          `Revisá que el stock de garantías esté cargado.`,
        link: `/sales/${result.id}`,
        email: true,
      });
    }

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
      description:
        `Registró una venta a "${contactName}" por $${result.total}` +
        (action === "deliver" ? " (confirmada y entregada)" : action === "confirm" ? " (confirmada)" : ""),
      link: `/sales/${result.id}`,
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

    return NextResponse.json(sinRollo.length > 0 ? { ...sale, sinRollo } : sale, { status: 201 });
  } catch (error) {
    if (error instanceof StockInsuficiente) {
      return NextResponse.json({ error: error.message, code: "INSUFFICIENT_STOCK" }, { status: 409 });
    }
    log.error({ err: error }, "Error creating sale");
    return NextResponse.json(
      { error: "Error creating sale" },
      { status: 500 }
    );
  }
}
