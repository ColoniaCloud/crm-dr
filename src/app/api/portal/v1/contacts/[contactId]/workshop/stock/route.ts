import { NextResponse } from "next/server";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { getWorkshopStock } from "@/lib/workshop";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/stock");

type Params = { params: Promise<{ contactId: string }> };

/**
 * El stock del instalador con los m² que quedan en cada rollo.
 *
 * Es un endpoint aparte y no una extensión de `GET /stock` (sección 4.2) a
 * propósito: aquel contrato ya está publicado y consumido, y agregarle campos
 * de un módulo que recién arranca lo ata a este. Cuando el taller esté
 * asentado se verá si conviene fusionarlos.
 */
export async function GET(request: Request, { params }: Params) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    return NextResponse.json(await getWorkshopStock(gate.contactId));
  } catch (error) {
    log.error({ err: error }, "Error fetching workshop stock");
    return NextResponse.json({ error: "Error al cargar el stock" }, { status: 500 });
  }
}
