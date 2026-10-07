import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { confirmSale } from "@/lib/sales";

const log = createLogger("api/remitos/sign");

/** Un error que se le muestra al operador tal cual, con su status. */
class FirmaRechazada extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * Firmar el remito marca la venta como entregada.
 *
 * **Si la venta seguía PENDING, primero la confirma.** El remito se crea junto
 * con la venta (sales/route.ts), así que se puede firmar sin haber pasado nunca
 * por CONFIRMED — y antes de este arreglo eso saltaba confirmSale(): la venta
 * quedaba DELIVERED sin descontar stock ni asignar el rollo de garantía. El
 * Cliente veía la compra en su panel y no veía el rollo en Stock (venta #114,
 * octubre 2026). Entregar mercadería implica haberla vendido, así que la firma
 * hace las dos cosas en la misma transacción: si no hay stock, no se firma.
 *
 * Una venta CANCELLED no se entrega: se rechaza.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const { id } = await params;

  try {
    const remito = await prisma.remito.findUnique({
      where: { id },
      include: { sale: true },
    });

    if (!remito) {
      return NextResponse.json({ error: "Remito no encontrado" }, { status: 404 });
    }

    if (remito.signedAt) {
      return NextResponse.json({ error: "El remito ya fue firmado" }, { status: 400 });
    }

    const now = new Date();

    const { updated, sinRollo, confirmada } = await prisma.$transaction(async (tx) => {
      // El estado se relee adentro de la transacción: entre la lectura de
      // arriba y acá alguien pudo confirmar o anular la venta.
      const sale = await tx.sale.findUnique({ where: { id: remito.saleId }, select: { status: true } });
      if (!sale) throw new FirmaRechazada("Venta no encontrada", 404);
      if (sale.status === "CANCELLED") {
        throw new FirmaRechazada("La venta está anulada: no se puede entregar");
      }

      let sinRollo: string[] = [];
      const confirmada = sale.status === "PENDING";
      if (confirmada) {
        try {
          ({ sinRollo } = await confirmSale(tx, remito.saleId, session.user.id, " (al firmar el remito)"));
        } catch (err) {
          // confirmSale tira con un mensaje para el operador (stock insuficiente).
          throw new FirmaRechazada(err instanceof Error ? err.message : "No se pudo confirmar la venta");
        }
      }

      const r = await tx.remito.update({
        where: { id },
        data: { signedAt: now },
      });

      await tx.sale.update({
        where: { id: remito.saleId },
        data: { status: "DELIVERED" },
      });

      return { updated: r, sinRollo, confirmada };
    });

    log.info({ remitoId: id, saleId: remito.saleId, confirmada }, "Remito firmado, venta marcada como entregada");

    await logOperatorAction({
      userId: session.user.id,
      action: "SIGN_REMITO",
      entityType: "REMITO",
      entityId: id,
      description: confirmada
        ? `Firmó remito (venta #${remito.sale.number}, confirmada al firmar)`
        : `Firmó remito (venta #${remito.sale.number})`,
      link: `/sales/${remito.saleId}`,
    });
    // `sinRollo`: productos con garantía que no consiguieron rollo. La firma
    // sale igual, pero el operador tiene que enterarse — mismo criterio que
    // la confirmación desde la ficha de la venta.
    return NextResponse.json({ ...updated, sinRollo });
  } catch (error) {
    if (error instanceof FirmaRechazada) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    log.error({ err: error }, "Error al firmar remito");
    return NextResponse.json(
      { error: "Error al firmar remito" },
      { status: 500 }
    );
  }
}
