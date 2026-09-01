import { NextResponse } from "next/server";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { getWorkshopSummary } from "@/lib/workshop";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/summary");

type Params = { params: Promise<{ contactId: string }> };

/**
 * Los números de la pantalla "Hoy".
 *
 * `from` y `to` acotan el período que se mide (facturado, cobrado, m²). Sin
 * ellos se toma el mes corriente, que es lo que el instalador quiere ver el 99%
 * de las veces y evita que el panel tenga que calcular fechas.
 */
export async function GET(request: Request, { params }: Params) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    const q = new URL(request.url).searchParams;
    const ahora = new Date();
    const from = q.get("from")
      ? new Date(q.get("from")!)
      : new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const to = q.get("to")
      ? new Date(q.get("to")!)
      : new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59, 999);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "from y to tienen que ser fechas ISO" }, { status: 400 });
    }
    if (to < from) {
      return NextResponse.json({ error: "to tiene que ser posterior a from" }, { status: 400 });
    }

    return NextResponse.json(await getWorkshopSummary(gate.contactId, from, to));
  } catch (error) {
    log.error({ err: error }, "Error fetching workshop summary");
    return NextResponse.json({ error: "Error al cargar el resumen" }, { status: 500 });
  }
}
