import { NextResponse } from "next/server";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { getAgenda } from "@/lib/workshop";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/agenda");

type Params = { params: Promise<{ contactId: string }> };

/** Tope del rango. Sin esto, un `from=1900&to=2100` se trae la agenda entera. */
const MAX_DIAS = 120;

export async function GET(request: Request, { params }: Params) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    const q = new URL(request.url).searchParams;
    const from = new Date(q.get("from") ?? "");
    const to = new Date(q.get("to") ?? "");

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json(
        { error: "from y to son requeridos, en formato ISO" },
        { status: 400 }
      );
    }
    if (to < from) {
      return NextResponse.json({ error: "to tiene que ser posterior a from" }, { status: 400 });
    }
    if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_DIAS) {
      return NextResponse.json(
        { error: `El rango no puede superar los ${MAX_DIAS} días` },
        { status: 400 }
      );
    }

    return NextResponse.json(await getAgenda(gate.contactId, from, to));
  } catch (error) {
    log.error({ err: error }, "Error fetching workshop agenda");
    return NextResponse.json({ error: "Error al cargar la agenda" }, { status: 500 });
  }
}
