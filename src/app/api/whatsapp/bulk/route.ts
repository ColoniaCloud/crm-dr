import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { esDemo } from "@/lib/demo-context";
import { logOperatorAction } from "@/lib/notifications";
import { WHATSAPP_ROLES } from "@/lib/whatsapp/access";
import { sendTemplateBatch } from "@/lib/whatsapp/bulk";
import { BULK_CHUNK, tally } from "@/lib/whatsapp/bulk-rules";
import { isCloudApiConfigured } from "@/lib/whatsapp/client";

const log = createLogger("api/whatsapp/bulk");

const schema = z.object({
  template: z.object({
    name: z.string().min(1).max(512),
    language: z.string().min(2).max(16),
  }),
  recipients: z
    .array(
      z.object({
        peer: z.string().min(8).max(20),
        name: z.string().max(200).default(""),
        params: z.array(z.string().max(1000)).max(20),
      })
    )
    .min(1)
    .max(BULK_CHUNK),
  skipExisting: z.boolean().default(true),
});

/**
 * Manda una plantilla a un lote de números (hasta `BULK_CHUNK`). La pantalla
 * parte la tanda en lotes y va llamando, para mostrar el avance y poder cortar
 * entre uno y otro.
 */
export async function POST(request: Request) {
  const gate = await requireRole(WHATSAPP_ROLES);
  if (!gate.success) return gate.response;

  if (esDemo()) return NextResponse.json({ error: "No disponible en la demostración" }, { status: 403 });

  const validation = validateBody(schema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;

  if (!isCloudApiConfigured()) {
    return NextResponse.json({ error: "WhatsApp (Cloud API) no está configurado" }, { status: 503 });
  }

  const { template, recipients, skipExisting } = validation.data;

  try {
    const outcomes = await sendTemplateBatch({
      template,
      recipients,
      skipExisting,
      userId: gate.session.user.id,
    });

    const { sent, skipped, failed } = tally(outcomes);
    await logOperatorAction({
      userId: gate.session.user.id,
      action: "WHATSAPP_BULK_TEMPLATE",
      entityType: "WhatsAppTemplate",
      entityId: template.name,
      description: `Envío masivo de la plantilla ${template.name} (${template.language}): ${sent} enviados, ${skipped} omitidos por tener conversación, ${failed} con error`,
    }).catch((err) => log.error({ err }, "No se pudo auditar el envío masivo"));

    return NextResponse.json({ outcomes });
  } catch (error) {
    log.error({ err: error }, "Error en el envío masivo de WhatsApp");
    return NextResponse.json({ error: "No se pudo completar el envío" }, { status: 500 });
  }
}
