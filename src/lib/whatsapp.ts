import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/whatsapp");

/**
 * Envío de un WhatsApp puntual.
 *
 * Existe porque hasta ahora el envío vivía inline en las rutas de
 * `/api/whatsapp/*`, atado a una sesión de operador. Los avisos automáticos
 * —el primero es el pedido de turno— no tienen operador detrás y no pueden
 * pasar por una ruta HTTP que exige `auth()`.
 *
 * **Nunca tira.** Un aviso que no sale no puede deshacer el pedido de turno que
 * ya entró, igual que en `warranty-claim-notify.ts`. Devuelve si salió, para
 * que quien llame pueda decidir si intenta por otro canal.
 */

/**
 * Deja el número como lo espera el servicio: solo dígitos y con código de país.
 *
 * Los prefijos que se contemplan son AR (54, y 549 para móviles) y UY (598),
 * que son los dos países donde hay instaladores. Un número que ya viene con
 * código se deja como está; uno que arranca en 0 pierde el cero de larga
 * distancia; uno corto se asume argentino.
 *
 * No adivina más que eso: si el número está mal cargado, el mensaje no sale y
 * queda registrado como fallido, que es mejor que mandárselo a un desconocido.
 */
export function normalizeWhatsappNumber(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("54") || d.startsWith("598") || d.startsWith("549")) return d;
  if (d.startsWith("0")) return "54" + d.slice(1);
  if (d.length <= 10) return "54" + d;
  return d;
}

export function isWhatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_SERVICE_URL && process.env.WHATSAPP_API_KEY);
}

export async function sendWhatsapp(opciones: {
  to: string;
  message: string;
  /** Para poder ver el mensaje en la ficha del contacto. */
  contactId?: string | null;
}): Promise<boolean> {
  const baseUrl = process.env.WHATSAPP_SERVICE_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  const number = normalizeWhatsappNumber(opciones.to);
  const message = opciones.message.trim();

  if (!baseUrl || !apiKey) {
    log.error("WhatsApp no configurado — no se manda el aviso");
    return false;
  }
  if (!number || !message) return false;

  let ok = false;
  let error: string | null = null;

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ number, message }),
      // El servicio de WhatsApp corre aparte y puede estar colgado. Sin
      // timeout, un aviso colgaría el request que lo disparó.
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
    ok = res.ok && Boolean(data.success);
    if (!ok) error = (data.error || `HTTP ${res.status}`).toString().slice(0, 500);
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 500) : "Error de red";
  }

  // El registro se escribe pase lo que pase: un mensaje que falló y no queda
  // anotado es un mensaje que nadie sabe que falta.
  try {
    await prisma.whatsAppMessage.create({
      data: {
        contactId: opciones.contactId ?? null,
        phone: number,
        message,
        status: ok ? "SENT" : "FAILED",
        error,
        // Sin `sentById`: no hubo operador, lo mandó el sistema.
        sentById: null,
      },
    });
  } catch (err) {
    log.error({ err }, "No se pudo registrar el WhatsApp enviado");
  }

  if (!ok) log.error({ error, number }, "No se pudo enviar el WhatsApp");
  return ok;
}
