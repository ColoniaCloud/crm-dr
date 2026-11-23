import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { sentTemplateNames } from "@/lib/whatsapp/template-tags";

const log = createLogger("api/whatsapp/template-tags");

/** Los nombres de las plantillas que se le mandaron a alguna ficha: las opciones del filtro de Leads. */
export async function GET() {
  const gate = await requireRole();
  if (!gate.success) return gate.response;

  try {
    return NextResponse.json({ names: await sentTemplateNames() });
  } catch (error) {
    log.error({ err: error }, "Error listing WhatsApp template tags");
    return NextResponse.json({ error: "No se pudieron cargar las plantillas" }, { status: 500 });
  }
}
