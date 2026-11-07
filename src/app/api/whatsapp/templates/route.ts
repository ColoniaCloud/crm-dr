import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/api-auth";
import { WHATSAPP_ROLES } from "@/lib/whatsapp/access";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { esDemo } from "@/lib/demo-context";
import { logOperatorAction } from "@/lib/notifications";
import { WhatsAppApiError, isCloudApiConfigured } from "@/lib/whatsapp/client";
import { getAllTemplates, getApprovedTemplates, submitNewTemplate } from "@/lib/whatsapp/templates";

const log = createLogger("api/whatsapp/templates");

/**
 * Plantillas de Meta.
 *
 * Por defecto, las aprobadas listas para mandar (caché de 5 min). Con `?all=1`,
 * todas con su estado —aprobada, en revisión, rechazada, pausada— para la solapa
 * de gestión. `?refresh=1` salta la caché.
 */
export async function GET(request: Request) {
  const gate = await requireRole(WHATSAPP_ROLES);
  if (!gate.success) return gate.response;

  if (!isCloudApiConfigured()) return NextResponse.json({ templates: [], configured: false });

  try {
    const params = new URL(request.url).searchParams;
    const force = params.get("refresh") === "1";
    if (params.get("all") === "1") {
      return NextResponse.json({ templates: await getAllTemplates(force), configured: true });
    }
    return NextResponse.json({ templates: await getApprovedTemplates(force), configured: true });
  } catch (error) {
    log.error({ err: error }, "Error loading WhatsApp templates");
    return NextResponse.json({ error: "No se pudieron cargar las plantillas de Meta" }, { status: 502 });
  }
}

const schema = z.object({
  name: z.string().min(1).max(512),
  language: z.string().min(2).max(16),
  category: z.enum(["UTILITY", "MARKETING"]),
  header: z.string().max(200).optional(),
  body: z.string().min(1).max(2000),
  footer: z.string().max(200).optional(),
  examples: z.array(z.string().max(300)).max(20).default([]),
});

/** Manda una plantilla nueva a revisión de Meta. Queda "en revisión" hasta que la apruebe o rechace. */
export async function POST(request: Request) {
  const gate = await requireRole(WHATSAPP_ROLES);
  if (!gate.success) return gate.response;

  if (esDemo()) return NextResponse.json({ error: "No disponible en la demostración" }, { status: 403 });

  const validation = validateBody(schema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;

  if (!isCloudApiConfigured()) {
    return NextResponse.json({ error: "WhatsApp (Cloud API) no está configurado" }, { status: 503 });
  }

  try {
    const created = await submitNewTemplate(validation.data);

    await logOperatorAction({
      userId: gate.session.user.id,
      action: "WHATSAPP_TEMPLATE_CREATED",
      entityType: "WhatsAppTemplate",
      entityId: created.id,
      description: `Envió a revisión de Meta la plantilla ${validation.data.name} (${validation.data.language}, ${validation.data.category})`,
    }).catch((err) => log.error({ err }, "No se pudo auditar la creación de la plantilla"));

    return NextResponse.json({ ok: true, id: created.id, status: created.status, category: created.category });
  } catch (error) {
    // Un problema de formato o un rechazo inmediato de Meta: el mensaje ya es legible.
    if (error instanceof WhatsAppApiError) {
      return NextResponse.json({ error: error.message }, { status: error.httpStatus >= 500 || error.httpStatus === 0 ? 502 : 400 });
    }
    if (error instanceof Error && !(error instanceof TypeError)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    log.error({ err: error }, "Error creating WhatsApp template");
    return NextResponse.json({ error: "No se pudo crear la plantilla" }, { status: 500 });
  }
}
