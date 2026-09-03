import { NextResponse } from "next/server";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { rejectBooking } from "@/lib/workshop";
import { avisarRespuestaAlCliente } from "@/lib/booking-notify";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/.../bookings/[bookingId]/reject");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ contactId: string; bookingId: string }> }
) {
  const { contactId, bookingId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    const r = await rejectBooking(gate.contactId, bookingId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

    void avisarRespuestaAlCliente(bookingId, false);
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error rejecting booking");
    return NextResponse.json({ error: "Error al rechazar el turno" }, { status: 500 });
  }
}
