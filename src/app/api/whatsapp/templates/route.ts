import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { isCloudApiConfigured } from "@/lib/whatsapp/client";
import { getApprovedTemplates } from "@/lib/whatsapp/templates";

const log = createLogger("api/whatsapp/templates");

/** Plantillas aprobadas por Meta (caché de 5 min). `?refresh=1` fuerza la recarga. */
export async function GET(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  if (!isCloudApiConfigured()) return NextResponse.json({ templates: [], configured: false });

  try {
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    return NextResponse.json({ templates: await getApprovedTemplates(force), configured: true });
  } catch (error) {
    log.error({ err: error }, "Error loading WhatsApp templates");
    return NextResponse.json({ error: "No se pudieron cargar las plantillas de Meta" }, { status: 502 });
  }
}
