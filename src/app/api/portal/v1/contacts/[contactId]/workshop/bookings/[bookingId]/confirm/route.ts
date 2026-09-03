import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { confirmBooking } from "@/lib/workshop";
import { avisarRespuestaAlCliente } from "@/lib/booking-notify";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/.../bookings/[bookingId]/confirm");

const schema = z
  .object({
    /** El taller puede correr el horario al confirmar; sin esto vale el pedido. */
    scheduledAt: z.string().datetime({ offset: true }).optional(),
  })
  .partial();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ contactId: string; bookingId: string }> }
) {
  const { contactId, bookingId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => ({}));
  const validation = validateBody(schema, json ?? {});
  if (!validation.success) return validation.response;

  try {
    const r = await confirmBooking(
      gate.contactId,
      bookingId,
      validation.data.scheduledAt ? new Date(validation.data.scheduledAt) : undefined
    );
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

    // El aviso no se espera: la orden ya existe y un mail lento no tiene que
    // dejar al instalador mirando un boton girando.
    void avisarRespuestaAlCliente(bookingId, true);
    return NextResponse.json({ ok: true, workOrderId: r.workOrderId });
  } catch (error) {
    log.error({ err: error }, "Error confirming booking");
    return NextResponse.json({ error: "Error al confirmar el turno" }, { status: 500 });
  }
}
