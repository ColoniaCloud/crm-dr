import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/.../bookings/[bookingId]/photo");

/**
 * La foto del vehiculo que subio el cliente al pedir turno.
 *
 * **Autenticada, a diferencia del logo del taller.** El logo es marca comercial
 * y esta en la fachada del local; esto es el auto de una persona, con su patente
 * a la vista y sacado en la puerta de su casa. Solo lo ve el taller dueño del
 * pedido: el `contactId` del gate entra en el `findFirst`, asi que un bookingId
 * de otro taller devuelve 404 y no confirma siquiera que exista.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ contactId: string; bookingId: string }> }
) {
  const { contactId, bookingId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    const b = await prisma.workshopBooking.findFirst({
      where: { id: bookingId, contactId: gate.contactId },
      select: { photo: true, photoMimeType: true },
    });
    if (!b?.photo) return new NextResponse(null, { status: 404 });

    const bytes = Buffer.from(b.photo, "base64");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": b.photoMimeType ?? "image/jpeg",
        "Content-Length": String(bytes.length),
        // Privada: no la puede cachear un proxy compartido.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    log.error({ err: error }, "Error serving booking photo");
    return new NextResponse(null, { status: 404 });
  }
}
