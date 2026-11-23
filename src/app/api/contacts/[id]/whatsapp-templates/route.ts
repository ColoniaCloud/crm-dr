import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { templateTagsFor } from "@/lib/whatsapp/template-tags";

const log = createLogger("api/contacts/whatsapp-templates");

/**
 * Las plantillas de WhatsApp que se le mandaron a una ficha (ver
 * `lib/whatsapp/template-tags.ts`). Son solo nombres y fechas, sin el contenido
 * de los mensajes, así que alcanza con tener sesión, como para ver la ficha.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;

  const { id } = await params;
  try {
    return NextResponse.json({ templates: await templateTagsFor(id) });
  } catch (error) {
    log.error({ err: error }, "Error loading WhatsApp template tags");
    return NextResponse.json({ error: "No se pudieron cargar las plantillas enviadas" }, { status: 500 });
  }
}
