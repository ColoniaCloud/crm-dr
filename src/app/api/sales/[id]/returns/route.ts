import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction, notifyAdmins } from "@/lib/notifications";
import { createSaleReturn, creditRatio, getReturnedQuantities } from "@/lib/returns";

const log = createLogger("api/sales/[id]/returns");

const createReturnSchema = z.object({
  refund: z.enum(["CREDIT_NOTE", "CASH"]),
  reason: z.string().optional(),
  items: z
    .array(z.object({ saleItemId: z.string().min(1), quantity: z.number().int().positive() }))
    .min(1),
});

/**
 * Devoluciones de una venta, más cuánto queda devolvible de cada ítem — que es
 * lo que la pantalla necesita para no ofrecer más unidades de las que salieron.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const sale = await prisma.sale.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        status: true,
        subtotal: true,
        total: true,
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });
    if (!sale) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });

    const [returns, devueltas] = await Promise.all([
      prisma.saleReturn.findMany({
        where: { saleId: id },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true } },
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        },
      }),
      getReturnedQuantities(prisma, id),
    ]);

    return NextResponse.json({
      returnable: sale.status === "CONFIRMED" || sale.status === "DELIVERED",
      // Con IVA o descuento, un peso de mercadería no acredita un peso: la
      // pantalla necesita la misma proporción que usa createSaleReturn para
      // no prometer un importe distinto del que se va a emitir.
      creditRatio: creditRatio(sale),
      items: sale.items.map((item) => {
        const returned = devueltas.get(item.id) ?? 0;
        return {
          saleItemId: item.id,
          productId: item.product.id,
          productName: item.product.name,
          sku: item.product.sku,
          unitPrice: Number(item.unitPrice),
          quantity: item.quantity,
          returned,
          returnable: item.quantity - returned,
        };
      }),
      returns: returns.map((r) => ({
        id: r.id,
        number: r.number,
        refund: r.refund,
        total: Number(r.total),
        reason: r.reason,
        retainedRolls: r.retainedRolls,
        createdAt: r.createdAt.toISOString(),
        user: r.user,
        items: r.items.map((i) => ({
          id: i.id,
          productName: i.product.name,
          sku: i.product.sku,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
          total: Number(i.total),
        })),
      })),
    });
  } catch (error) {
    log.error({ err: error }, "Error listing sale returns");
    return NextResponse.json({ error: "Error al obtener las devoluciones" }, { status: 500 });
  }
}

// Mismo nivel que anular una venta: una devolución mueve stock y toca la
// cuenta corriente, así que OPERATOR no llega.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json(
      { error: "Solo un administrador puede registrar una devolución" },
      { status: 403 }
    );
  }

  const { id } = await params;

  const json = await request.json().catch(() => null);
  const validation = createReturnSchema.safeParse(json);
  if (!validation.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) =>
      createSaleReturn(tx, {
        saleId: id,
        userId: session.user.id,
        refund: validation.data.refund,
        reason: validation.data.reason,
        items: validation.data.items,
      })
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const contacto = await prisma.sale.findUnique({
      where: { id },
      select: { contact: { select: { firstName: true, lastName: true, company: true } } },
    });
    const cName =
      contacto?.contact.company ||
      `${contacto?.contact.firstName ?? ""} ${contacto?.contact.lastName ?? ""}`.trim();

    await logOperatorAction({
      userId: session.user.id,
      action: "CREATE_SALE_RETURN",
      entityType: "SALE",
      entityId: id,
      description:
        `Registró la devolución #${result.number} sobre la venta #${result.saleNumber} de "${cName}" ` +
        `por $${result.total} (${result.refund === "CASH" ? "efectivo reintegrado" : "nota de crédito"})`,
      link: `/sales/${id}`,
    });

    // El rollo no vuelve a stock cuando el cliente final ya activó la garantía.
    // Sin este aviso nadie se entera hasta que alguien intenta venderlo de nuevo.
    if (result.retainedRolls.length > 0) {
      await notifyAdmins({
        type: "RETURN_WITH_ACTIVE_WARRANTY",
        title: "Una devolución dejó rollos con garantía activa",
        message:
          `La devolución #${result.number} sobre la venta #${result.saleNumber} de "${cName}" no pudo liberar ` +
          `${result.retainedRolls.join(", ")}: el cliente final ya activó esa garantía. ` +
          `La mercadería volvió igual, pero esos rollos siguen asignados y hay que resolverlos a mano.`,
        link: `/sales/${id}`,
      });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating sale return");
    return NextResponse.json({ error: "Error al registrar la devolución" }, { status: 500 });
  }
}
