import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { esDemo } from "@/lib/demo-context";
import { createLogger } from "@/lib/logger";
import { WHATSAPP_ROLES } from "@/lib/whatsapp/access";
import { TemplateReviewError, reviewTemplate } from "@/lib/whatsapp/template-review";
import { validateNewTemplate } from "@/lib/whatsapp/template-rules";
import { newTemplateSchema } from "@/lib/whatsapp/template-schema";

const log = createLogger("api/whatsapp/templates/review");

/**
 * Revisa con IA una plantilla antes de mandarla a Meta: si los botones
 * corresponden, si la categoría es la que Meta le va a poner y qué convendría
 * cambiar. Recibe lo mismo que la ruta que la crea.
 *
 * No crea nada ni habla con Meta, así que no depende de la línea. Las reglas de
 * formato se validan primero: si no pasan, se devuelve ese error y no se gasta
 * una llamada a la IA en algo que Meta va a rechazar de plano.
 */
export async function POST(request: Request) {
  const gate = await requireRole(WHATSAPP_ROLES);
  if (!gate.success) return gate.response;

  if (esDemo()) return NextResponse.json({ error: "No disponible en la demostración" }, { status: 403 });

  const validation = validateBody(newTemplateSchema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;

  const problem = validateNewTemplate(validation.data);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    return NextResponse.json({ review: await reviewTemplate(validation.data) });
  } catch (error) {
    if (error instanceof TemplateReviewError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    log.error({ err: error }, "Error reviewing WhatsApp template");
    return NextResponse.json({ error: "No se pudo revisar la plantilla" }, { status: 500 });
  }
}
