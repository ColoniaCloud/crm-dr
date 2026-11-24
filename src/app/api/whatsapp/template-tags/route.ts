import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { isCloudApiConfigured } from "@/lib/whatsapp/client";
import { allTemplateAccounts } from "@/lib/whatsapp/lines";
import { sentTemplateNames } from "@/lib/whatsapp/template-tags";
import { existingTemplateNames } from "@/lib/whatsapp/templates";

const log = createLogger("api/whatsapp/template-tags");

/**
 * Los nombres de las plantillas que se le mandaron a alguna ficha: las opciones del
 * filtro de Leads y Clientes. Las que se borraron de Meta no se ofrecen (el
 * historial de envíos sigue en la ficha). Si Meta no responde, van todas.
 */
export async function GET() {
  const gate = await requireRole();
  if (!gate.success) return gate.response;

  try {
    const names = await sentTemplateNames();
    const existing = isCloudApiConfigured() ? await existingTemplateNames(allTemplateAccounts()) : null;
    return NextResponse.json({ names: existing ? names.filter((n) => existing.has(n)) : names });
  } catch (error) {
    log.error({ err: error }, "Error listing WhatsApp template tags");
    return NextResponse.json({ error: "No se pudieron cargar las plantillas" }, { status: 500 });
  }
}
