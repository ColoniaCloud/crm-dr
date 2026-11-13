import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { esDemo } from "@/lib/demo-context";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { SignupError, completeSignup, signupClientConfig } from "@/lib/whatsapp/embedded-signup";

const log = createLogger("api/whatsapp/embedded-signup");

/**
 * Alta de un número de WhatsApp en coexistencia (ver `embedded-signup.ts`).
 *
 * Solo SUPERADMIN: conecta números de la empresa a la API y pide a Meta el
 * historial de chats de ese número.
 */

/** Lo que necesita la pantalla para abrir el flujo de Meta. */
export async function GET() {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  return NextResponse.json(signupClientConfig());
}

const schema = z.object({
  code: z.string().min(10).max(2000),
  wabaId: z.string().regex(/^\d{5,25}$/),
  event: z.string().max(80).nullable().optional(),
});

/** Termina el alta con el código y la cuenta que devolvió el flujo. */
export async function POST(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  if (esDemo()) return NextResponse.json({ error: "No disponible en la demostración" }, { status: 403 });

  const validation = validateBody(schema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;

  try {
    const report = await completeSignup(validation.data);

    await logOperatorAction({
      userId: gate.session.user.id,
      action: "WHATSAPP_NUMBER_CONNECTED",
      entityType: "WhatsAppAccount",
      entityId: report.wabaId,
      description: `Conectó por el alta de Meta los números ${report.phones.map((p) => p.number || p.id).join(", ") || "(ninguno)"}${report.coexistence ? " en coexistencia" : ""}`,
    }).catch((err) => log.error({ err }, "No se pudo auditar el alta"));

    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof SignupError) return NextResponse.json({ error: error.message }, { status: error.status });
    log.error({ err: error }, "Error completing WhatsApp embedded signup");
    return NextResponse.json({ error: "No se pudo completar el alta" }, { status: 500 });
  }
}
