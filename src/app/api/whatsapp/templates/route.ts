import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { esDemo } from "@/lib/demo-context";
import { logOperatorAction } from "@/lib/notifications";
import { WhatsAppApiError, isCloudApiConfigured } from "@/lib/whatsapp/client";
import { requireWhatsAppLine } from "@/lib/whatsapp/line-access";
import { templatesAccountOf } from "@/lib/whatsapp/lines";
import { newTemplateSchema } from "@/lib/whatsapp/template-schema";
import { systemTemplateNames } from "@/lib/whatsapp/notices";
import { getAllTemplates, getApprovedTemplates, removeTemplate, submitNewTemplate } from "@/lib/whatsapp/templates";

const log = createLogger("api/whatsapp/templates");

/**
 * Plantillas de Meta.
 *
 * Por defecto, las aprobadas listas para mandar (caché de 5 min). Con `?all=1`,
 * todas con su estado —aprobada, en revisión, rechazada, pausada— para la solapa
 * de gestión. `?refresh=1` salta la caché.
 *
 * Las plantillas son de la cuenta de cada línea (`?line=`): cada una ve, manda y
 * crea solo las suyas.
 */
export async function GET(request: Request) {
  const gate = await requireWhatsAppLine(request);
  if (!gate.success) return gate.response;

  if (!isCloudApiConfigured()) return NextResponse.json({ templates: [], configured: false });

  try {
    const params = new URL(request.url).searchParams;
    const force = params.get("refresh") === "1";
    const account = templatesAccountOf(gate.line);
    if (params.get("all") === "1") {
      const system = new Set(systemTemplateNames());
      const rows = (await getAllTemplates(force, account)).map((t) => (system.has(t.name) ? { ...t, system: true } : t));
      return NextResponse.json({ templates: rows, configured: true });
    }
    return NextResponse.json({ templates: await getApprovedTemplates(force, account), configured: true });
  } catch (error) {
    log.error({ err: error }, "Error loading WhatsApp templates");
    return NextResponse.json({ error: "No se pudieron cargar las plantillas de Meta" }, { status: 502 });
  }
}

const schema = newTemplateSchema;

/** Manda una plantilla nueva a revisión de Meta. Queda "en revisión" hasta que la apruebe o rechace. */
export async function POST(request: Request) {
  const gate = await requireWhatsAppLine(request);
  if (!gate.success) return gate.response;

  if (esDemo()) return NextResponse.json({ error: "No disponible en la demostración" }, { status: 403 });

  const validation = validateBody(schema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;

  if (!isCloudApiConfigured()) {
    return NextResponse.json({ error: "WhatsApp (Cloud API) no está configurado" }, { status: 503 });
  }

  try {
    const created = await submitNewTemplate(validation.data, templatesAccountOf(gate.line));

    await logOperatorAction({
      userId: gate.session.user.id,
      action: "WHATSAPP_TEMPLATE_CREATED",
      entityType: "WhatsAppTemplate",
      entityId: created.id,
      description: `Envió a revisión de Meta la plantilla ${validation.data.name} (${validation.data.language}, ${validation.data.category}) en ${gate.line.label}`,
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

const deleteSchema = z.object({
  name: z.string().min(1).max(512),
  /** El id de Meta de ese idioma; sin él se borra el nombre en todos los idiomas. */
  id: z.string().regex(/^\d+$/).max(40).optional(),
  language: z.string().max(16).optional(),
});

/**
 * Borra una plantilla de la cuenta de la línea. Solo ADMIN en adelante (el guardia
 * de WhatsApp), nunca en la demostración, y nunca una de las que el CRM manda solo.
 * Al borrarla deja de aparecer también en los filtros de Leads y Clientes.
 */
export async function DELETE(request: Request) {
  const gate = await requireWhatsAppLine(request);
  if (!gate.success) return gate.response;

  if (esDemo()) return NextResponse.json({ error: "No disponible en la demostración" }, { status: 403 });

  const validation = validateBody(deleteSchema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;
  const { name, id, language } = validation.data;

  if (systemTemplateNames().includes(name)) {
    return NextResponse.json(
      { error: "Esta plantilla la usa el CRM para sus avisos automáticos: si se borra, esos avisos dejan de salir." },
      { status: 409 }
    );
  }

  if (!isCloudApiConfigured()) {
    return NextResponse.json({ error: "WhatsApp (Cloud API) no está configurado" }, { status: 503 });
  }

  try {
    await removeTemplate(name, id, templatesAccountOf(gate.line));

    await logOperatorAction({
      userId: gate.session.user.id,
      action: "WHATSAPP_TEMPLATE_DELETED",
      entityType: "WhatsAppTemplate",
      entityId: id ?? name,
      description: `Borró la plantilla ${name}${language ? ` (${language})` : ""} en ${gate.line.label}`,
    }).catch((err) => log.error({ err }, "No se pudo auditar el borrado de la plantilla"));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof WhatsAppApiError) {
      return NextResponse.json({ error: error.message }, { status: error.httpStatus >= 500 || error.httpStatus === 0 ? 502 : 400 });
    }
    log.error({ err: error }, "Error deleting WhatsApp template");
    return NextResponse.json({ error: "No se pudo borrar la plantilla" }, { status: 500 });
  }
}
