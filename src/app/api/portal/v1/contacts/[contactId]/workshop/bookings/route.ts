import { NextResponse } from "next/server";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { listBookings } from "@/lib/workshop";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/bookings");

/** La bandeja de pedidos de turno del taller. `?pendientes=1` filtra. */
export async function GET(request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    const soloPendientes = new URL(request.url).searchParams.get("pendientes") === "1";
    return NextResponse.json(await listBookings(gate.contactId, soloPendientes));
  } catch (error) {
    log.error({ err: error }, "Error listing bookings");
    return NextResponse.json({ error: "Error al cargar los pedidos" }, { status: 500 });
  }
}
