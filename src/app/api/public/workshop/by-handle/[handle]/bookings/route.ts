import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePublicSiteApiKey } from "@/lib/public-site-auth";
import { createBooking } from "@/lib/workshop";
import { avisarPedidoAlInstalador, avisarPedidoAlCliente } from "@/lib/booking-notify";
import { validateBody } from "@/lib/api-validation";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { VEHICLE_TYPES } from "@/lib/vehicle-types";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/public/workshop/by-handle/[handle]/bookings");

/**
 * Un pedido de turno desde la pagina publica del taller.
 *
 * **Es el unico endpoint donde un desconocido escribe en el CRM**, asi que es el
 * que hay que mirar con mas cuidado:
 *
 * - No crea una orden de trabajo. Crea un pedido PENDIENTE que el instalador
 *   confirma. La agenda no se llena sola.
 * - Limite por IP y por taller. La confirmacion manual evita que se ensucie la
 *   agenda, pero no evita que se llene la bandeja.
 * - El `serviceId` se valida contra los servicios DE ESE taller; uno de otro
 *   taller se ignora y el pedido queda como consulta general.
 * - 404 si el taller no publico su pagina, igual que la consulta.
 */

const schema = z.object({
  serviceId: z.string().trim().max(64).nullish(),
  clientName: z.string().trim().min(2, "Poné tu nombre").max(120),
  clientEmail: z.string().trim().email("Revisá el email").max(191).nullish(),
  clientPhone: z.string().trim().min(6, "Poné un teléfono").max(50),
  vehicleType: z.enum(VEHICLE_TYPES).nullish(),
  plate: z.string().trim().max(20).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  preferredAt: z.string().datetime({ offset: true }),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const gate = await requirePublicSiteApiKey(request);
  if (!gate.success) return gate.response;

  const { handle } = await params;

  // Dos limites, y cada uno tapa un agujero distinto: el de IP frena a uno que
  // insiste, el de taller evita que la bandeja de UN instalador quede
  // inutilizable aunque el trafico venga repartido.
  const ip = clientIp(request);
  if (!rateLimit(`booking-ip:${ip}`, 10, 60 * 60_000).allowed) {
    return NextResponse.json(
      { error: "Muchos pedidos seguidos. Probá de nuevo en un rato." },
      { status: 429 }
    );
  }
  if (!rateLimit(`booking-taller:${handle}`, 30, 60 * 60_000).allowed) {
    return NextResponse.json(
      { error: "Este taller recibió muchos pedidos. Probá más tarde." },
      { status: 429 }
    );
  }

  const json = await request.json().catch(() => null);
  const validation = validateBody(schema, json);
  if (!validation.success) return validation.response;
  const d = validation.data;

  const preferredAt = new Date(d.preferredAt);
  const ahora = Date.now();
  if (preferredAt.getTime() < ahora) {
    return NextResponse.json({ error: "Elegí una fecha futura" }, { status: 400 });
  }
  // Un ano para adelante. Sin tope, un turno para 2099 queda en la bandeja para
  // siempre y no hay forma de que caduque solo.
  if (preferredAt.getTime() > ahora + 365 * 24 * 3600 * 1000) {
    return NextResponse.json({ error: "Esa fecha está demasiado lejos" }, { status: 400 });
  }

  try {
    const booking = await createBooking(handle.toLowerCase(), { ...d, preferredAt });
    if (!booking) {
      return NextResponse.json({ error: "Taller no encontrado" }, { status: 404 });
    }

    // Los avisos NO se esperan: el pedido ya esta guardado, y colgar la
    // respuesta hasta que salga un mail hace que el cliente vea un formulario
    // trabado cuando en realidad su turno ya entro.
    void avisarPedidoAlInstalador(booking.id);
    void avisarPedidoAlCliente(booking.id);

    // No se devuelve el id ni el cancelToken: el acuse va por mail. Lo unico
    // que necesita la pagina es saber que salio bien.
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating booking");
    return NextResponse.json({ error: "Error al pedir el turno" }, { status: 500 });
  }
}
