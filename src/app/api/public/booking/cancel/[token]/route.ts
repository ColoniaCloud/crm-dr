import { NextResponse } from "next/server";
import { requirePublicSiteApiKey } from "@/lib/public-site-auth";
import { cancelBookingByToken } from "@/lib/workshop";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/public/booking/cancel/[token]");

/**
 * El cliente cancela su pedido con el token que le llego por mail.
 *
 * Solo cancela lo que sigue PENDIENTE. Una vez que el taller confirmo hay una
 * orden agendada, y deshacerla desde un link de correo sin que el taller se
 * entere seria peor que un llamado.
 *
 * Devuelve 404 tanto si el token no existe como si el pedido ya fue respondido:
 * el token es un secreto y no tiene por que confirmar cual de las dos cosas es.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const gate = await requirePublicSiteApiKey(request);
  if (!gate.success) return gate.response;

  try {
    const { token } = await params;
    const ok = await cancelBookingByToken(token);
    if (!ok) return NextResponse.json({ error: "No se pudo cancelar" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error cancelling booking");
    return NextResponse.json({ error: "Error al cancelar" }, { status: 500 });
  }
}
