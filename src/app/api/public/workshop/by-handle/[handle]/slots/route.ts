import { NextResponse } from "next/server";
import { requirePublicSiteApiKey } from "@/lib/public-site-auth";
import { getAvailableSlots } from "@/lib/workshop-slots";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/public/workshop/by-handle/[handle]/slots");

/**
 * Los horarios libres del taller.
 *
 * `?serviceId=` cambia el resultado: un servicio de cuatro horas tiene menos
 * huecos que uno de media, y ofrecerlos como si fueran iguales termina en un
 * turno que no entra antes de cerrar.
 *
 * `?desde=` y `?hasta=` en ISO. Sin ellos, los proximos catorce dias.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const gate = await requirePublicSiteApiKey(request);
  if (!gate.success) return gate.response;

  // Mas alto que el de la ficha del taller: la pantalla consulta de nuevo cada
  // vez que el cliente cambia de servicio, y eso es uso normal.
  if (!rateLimit(`psite-slots:${clientIp(request)}`, 900, 60_000).allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const { handle } = await params;
    const q = new URL(request.url).searchParams;

    const desde = q.get("desde") ? new Date(q.get("desde")!) : new Date();
    const hasta = q.get("hasta")
      ? new Date(q.get("hasta")!)
      : new Date(Date.now() + 14 * 86_400_000);
    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
      return NextResponse.json({ error: "Fechas invalidas" }, { status: 400 });
    }

    const dias = await getAvailableSlots(handle.toLowerCase(), {
      serviceId: q.get("serviceId"),
      desde,
      hasta,
    });
    // Mismo 404 que la ficha: un taller sin publicar no se distingue de uno que
    // no existe.
    if (dias === null) {
      return NextResponse.json({ error: "Taller no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ dias });
  } catch (error) {
    log.error({ err: error }, "Error computing slots");
    return NextResponse.json({ error: "Error al consultar los horarios" }, { status: 500 });
  }
}
