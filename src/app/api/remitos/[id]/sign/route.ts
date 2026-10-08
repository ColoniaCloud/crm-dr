import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { FirmaRechazada, afterRemitoSigned, signRemito } from "@/lib/remito-sign";

const log = createLogger("api/remitos/sign");

/**
 * Un operador registra que el cliente firmó el remito EN PAPEL.
 *
 * Es el viejo botón "Firmar" de la lista de Remitos (y "Registrar firma" de la
 * ficha). No captura trazo: deja constancia de quién lo registró y congela el
 * contenido del remito, igual que una firma online. Toda la lógica —confirmar
 * si estaba PENDING, pasar a DELIVERED, snapshot— vive en src/lib/remito-sign.ts.
 *
 * No manda copia por mail: el cliente se quedó con la suya en papel.
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
    const result = await signRemito({ remitoId: id, via: "PAPER", actorUserId: session.user.id });
    await afterRemitoSigned(result, { emailTo: null });

    log.info({ remitoId: id, saleId: result.saleId, confirmada: result.confirmada }, "Remito firmado en papel, venta entregada");

    await logOperatorAction({
      userId: session.user.id,
      action: "SIGN_REMITO",
      entityType: "REMITO",
      entityId: id,
      description: result.confirmada
        ? `Registró la firma en papel del remito #${result.remitoNumber} (venta #${result.saleNumber}, confirmada al firmar)`
        : `Registró la firma en papel del remito #${result.remitoNumber} (venta #${result.saleNumber})`,
      link: `/sales/${result.saleId}`,
    });
    // `sinRollo`: productos con garantía que no consiguieron rollo. La firma
    // sale igual, pero el operador tiene que enterarse.
    return NextResponse.json({ ok: true, signedAt: result.signature.signedAt, sinRollo: result.sinRollo });
  } catch (error) {
    if (error instanceof FirmaRechazada) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    log.error({ err: error }, "Error al firmar remito");
    return NextResponse.json({ error: "Error al firmar remito" }, { status: 500 });
  }
}
