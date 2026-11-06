import { after, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { isValidMetaSignature, safeEqualStrings } from "@/lib/whatsapp/signature";
import { processWhatsAppWebhook } from "@/lib/whatsapp/webhook-processor";
import type { WhatsAppWebhookPayload } from "@/types/whatsapp";

const log = createLogger("api/webhooks/whatsapp");

// El body crudo se lee en cada request y nunca se puede cachear.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Webhook de la WhatsApp Business Cloud API (Meta).
 *
 * Es público a propósito: `src/proxy.ts` deja pasar todo `/api/*` sin sesión, y
 * la credencial de este endpoint no es un login sino la firma HMAC de Meta
 * (POST) o el verify token (GET).
 *
 * Configuración y rotación de tokens: ver WHATSAPP-CLOUD-API.md.
 */

/**
 * Verificación inicial: Meta llama una vez al guardar la URL del webhook en el
 * panel, con `hub.mode`, `hub.verify_token` y `hub.challenge`. Hay que devolver
 * el challenge en texto plano.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expected) {
    log.error("WHATSAPP_VERIFY_TOKEN no está configurado");
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (mode === "subscribe" && token && challenge !== null && safeEqualStrings(token, expected)) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  log.warn({ mode }, "Verificación de webhook rechazada");
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Eventos reales. Orden:
 *   1. leer el body crudo (la firma se calcula sobre los bytes originales),
 *   2. validar la firma,
 *   3. responder 200 enseguida,
 *   4. procesar y persistir ya con la respuesta enviada (`after`).
 */
export async function POST(req: Request) {
  const rawBody = await req.text();

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    // Sin secret no se puede distinguir a Meta de cualquiera: no se acepta nada.
    log.error("WHATSAPP_APP_SECRET no está configurado");
    return new NextResponse("Forbidden", { status: 403 });
  }

  const signature = req.headers.get("x-hub-signature-256");
  if (!isValidMetaSignature(rawBody, signature, appSecret)) {
    log.warn({ hasSignature: Boolean(signature), bytes: rawBody.length }, "Firma de webhook inválida");
    return new NextResponse("Forbidden", { status: 403 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    // Firma válida pero JSON roto: reintentar no lo arregla. 200 para que Meta
    // no lo reenvíe, y queda anotado.
    log.error({ bytes: rawBody.length }, "Webhook firmado con JSON inválido");
    return new NextResponse("OK", { status: 200 });
  }

  if (payload.object !== "whatsapp_business_account") {
    return new NextResponse("OK", { status: 200 });
  }

  after(async () => {
    try {
      await processWhatsAppWebhook(payload);
    } catch (err) {
      log.error({ err }, "Falló el procesamiento del webhook de WhatsApp");
    }
  });

  return new NextResponse("OK", { status: 200 });
}
