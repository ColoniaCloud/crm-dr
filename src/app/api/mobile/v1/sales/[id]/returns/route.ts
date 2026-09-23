import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction, notifyAdmins } from "@/lib/notifications";
import { createSaleReturn, creditRatio, getReturnedQuantities } from "@/lib/returns";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mobile/v1/sales/[id]/returns");

const createReturnSchema = z.object({
  refund: z.enum(["CREDIT_NOTE", "CASH"]),
  reason: z.string().optional(),
  items: z
    .array(z.object({ saleItemId: z.string().min(1), quantity: z.number().int().positive() }))
    .min(1),
});

export function OPTIONS() {
  return mobileCorsPreflight();
}

/**
 * Qué se puede devolver de esta venta y qué ya se devolvió.
 *
 * Lo lee cualquier usuario logueado —el vendedor en ruta necesita poder
 * mirarlo—, pero registrar la devolución (POST) pide ADMIN.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

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
    if (!sale) {
      return withMobileCors(NextResponse.json({ error: "Venta no encontrada" }, { status: 404 }));
    }

    const [returns, devueltas] = await Promise.all([
      prisma.saleReturn.findMany({
        where: { saleId: id },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true } },
          items: { include: { product: { select: { name: true, sku: true } } } },
        },
      }),
      getReturnedQuantities(prisma, id),
    ]);

    return withMobileCors(
      NextResponse.json({
        saleNumber: sale.number,
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
          userName: r.user.name,
          items: r.items.map((i) => ({
            id: i.id,
            productName: i.product.name,
            sku: i.product.sku,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            total: Number(i.total),
          })),
        })),
      })
    );
  } catch (error) {
    log.error({ err: error }, "Error listing sale returns");
    return withMobileCors(
      NextResponse.json({ error: "Error al obtener las devoluciones" }, { status: 500 })
    );
  }
}

// Mismo criterio que el CRM: una devolución mueve stock y toca la cuenta
// corriente, así que la cierra un administrador. El vendedor OPERATOR ve la
// pantalla y los datos, pero el botón no es para él.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireMobileAuth(request, ["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return withMobileCors(gate.response);

  const json = await request.json().catch(() => null);
  const validation = validateBody(createReturnSchema, json);
  if (!validation.success) return withMobileCors(validation.response);

  try {
    const { id } = await params;

    const result = await prisma.$transaction(async (tx) =>
      createSaleReturn(tx, {
        saleId: id,
        userId: gate.user.sub,
        refund: validation.data.refund,
        reason: validation.data.reason,
        items: validation.data.items,
      })
    );

    if (!result.ok) {
      return withMobileCors(NextResponse.json({ error: result.error }, { status: 400 }));
    }

    const contacto = await prisma.sale.findUnique({
      where: { id },
      select: { contact: { select: { firstName: true, lastName: true, company: true } } },
    });
    const cName =
      contacto?.contact.company ||
      `${contacto?.contact.firstName ?? ""} ${contacto?.contact.lastName ?? ""}`.trim();

    await logOperatorAction({
      userId: gate.user.sub,
      action: "CREATE_SALE_RETURN",
      entityType: "SALE",
      entityId: id,
      description:
        `Registró la devolución #${result.number} sobre la venta #${result.saleNumber} de "${cName}" ` +
        `por $${result.total} (${result.refund === "CASH" ? "efectivo reintegrado" : "nota de crédito"}) (app móvil)`,
      link: `/sales/${id}`,
    });

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

    return withMobileCors(NextResponse.json(result, { status: 201 }));
  } catch (error) {
    log.error({ err: error }, "Error creating sale return");
    return withMobileCors(
      NextResponse.json({ error: "Error al registrar la devolución" }, { status: 500 })
    );
  }
}
