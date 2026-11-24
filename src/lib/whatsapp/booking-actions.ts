import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { confirmBooking, rejectBooking } from "@/lib/workshop";
import { avisarRespuestaAlCliente } from "@/lib/booking-notify";
import { portalBaseUrl } from "@/lib/portal-tokens";
import { sendReplyButtons, sendTextMessage, WhatsAppApiError } from "@/lib/whatsapp/client";
import { isPrimaryPhoneNumberId, primaryLine } from "@/lib/whatsapp/lines";
import { recordOutbound } from "@/lib/whatsapp/outbound";
import {
  bookingButtonPayload,
  isInstallerNumber,
  parseBookingButton,
} from "@/lib/whatsapp/booking-buttons";
import type { WhatsAppInboundMessage, WhatsAppSendResponse } from "@/types/whatsapp";

const log = createLogger("lib/whatsapp/booking-actions");

/**
 * Lo que pasa cuando el instalador toca Confirmar o Rechazar en el WhatsApp de
 * un pedido de turno (los botones y su formato están en `booking-buttons.ts`).
 *
 * Lo llama el procesador del webhook con cada mensaje entrante **nuevo** (no los
 * reintentos de Meta), después de guardarlo. Devuelve si el mensaje era uno de
 * estos toques, lo haya podido resolver o no. No tira nunca: el webhook ya
 * respondió 200 y no hay a quién devolverle un error.
 *
 * Quién puede responder: solo el teléfono del instalador dueño del pedido, y
 * solo por la línea principal (WPP Carlos), que es por donde sale el aviso. Un
 * toque desde otro número no hace nada ni recibe respuesta: no se le confirma a
 * un desconocido que esa llave existe.
 */
export async function handleBookingButton(
  message: WhatsAppInboundMessage,
  phoneNumberId: string
): Promise<boolean> {
  const parsed = parseBookingButton(message);
  if (!parsed) return false;

  try {
    if (!isPrimaryPhoneNumberId(phoneNumberId)) {
      log.warn({ phoneNumberId }, "Botón de turno en una línea que no es la principal: se ignora");
      return true;
    }

    const booking = await prisma.workshopBooking.findUnique({
      where: { actionToken: parsed.token },
      select: {
        id: true,
        contactId: true,
        status: true,
        serviceName: true,
        clientName: true,
        clientEmail: true,
        category: true,
        timeWindow: true,
        preferredAt: true,
        contact: { select: { phone: true, whatsapp: true } },
        workOrder: { select: { scheduledAt: true } },
      },
    });

    if (!booking || !isInstallerNumber(message.from, booking.contact)) {
      log.warn(
        { from: message.from, action: parsed.action, found: Boolean(booking) },
        "Botón de turno con una llave que no es de quien la toca: se ignora"
      );
      return true;
    }

    const reply = (text: string) => replyText(message.from, text, booking.contactId);
    const resumen = `${booking.serviceName} · ${cuandoTexto(booking)} · ${booking.clientName}`;

    if (booking.status !== "PENDIENTE") {
      await reply(`Este pedido ya estaba ${ESTADO[booking.status] ?? "respondido"}, no cambiamos nada.\n\n${resumen}`);
      return true;
    }

    switch (parsed.action) {
      case "confirmar": {
        const r = await confirmBooking(booking.contactId, booking.id);
        if (!r.ok) {
          await reply(`No pudimos confirmar el turno (${r.error}). Probá desde tu panel: ${linkBandeja()}`);
          return true;
        }
        void avisarRespuestaAlCliente(booking.id, true);
        await reply(
          `✅ Turno confirmado y agendado en Mi Taller.\n\n${resumen}` +
            (booking.clientEmail ? "\n\nLe avisamos al cliente por mail." : "\n\nEl cliente no dejó mail: avisale vos.") +
            `\n\nSi necesitás cambiar la hora, hacelo desde tu panel: ${linkBandeja()}`
        );
        return true;
      }

      case "rechazar": {
        // Rechazar no tiene vuelta y le llega al cliente: se pregunta antes.
        await replyButtons(
          message.from,
          `¿Seguro que querés rechazar este pedido?\n\n${resumen}\n\nAl cliente le avisamos que no pudiste tomarlo.`,
          [
            { id: bookingButtonPayload("rechazar-si", parsed.token), title: "Sí, rechazar" },
            { id: bookingButtonPayload("mantener", parsed.token), title: "No, dejarlo" },
          ],
          booking.contactId
        );
        return true;
      }

      case "rechazar-si": {
        const r = await rejectBooking(booking.contactId, booking.id);
        if (!r.ok) {
          await reply(`No pudimos rechazar el pedido (${r.error}). Probá desde tu panel: ${linkBandeja()}`);
          return true;
        }
        void avisarRespuestaAlCliente(booking.id, false);
        await reply(
          `Pedido rechazado.\n\n${resumen}` +
            (booking.clientEmail ? "\n\nLe avisamos al cliente por mail." : "")
        );
        return true;
      }

      case "mantener": {
        await reply(
          `Listo, el pedido sigue pendiente.\n\n${resumen}\n\nPodés confirmarlo con el botón del primer mensaje o desde tu panel: ${linkBandeja()}`
        );
        return true;
      }
    }
  } catch (err) {
    log.error({ err, action: parsed.action }, "No se pudo resolver el botón de un pedido de turno");
  }
  return true;
}

// ─── Respuestas ──────────────────────────────────────────────────────────────

const ESTADO: Record<string, string> = {
  CONFIRMADA: "confirmado",
  RECHAZADA: "rechazado",
  CANCELADA: "cancelado por el cliente",
};

const TZ = "America/Argentina/Buenos_Aires";

function cuandoTexto(b: {
  category: string;
  timeWindow: string | null;
  preferredAt: Date;
  workOrder: { scheduledAt: Date | null } | null;
}): string {
  // En arquitectura se pidió una franja, no una hora: no se la inventa.
  if (b.category === "ARCHITECTURAL") {
    return b.preferredAt.toLocaleDateString("es-AR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
  }
  const at = b.workOrder?.scheduledAt ?? b.preferredAt;
  return at.toLocaleString("es-AR", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function linkBandeja(): string {
  return `${portalBaseUrl()}/cliente/taller/turnos`;
}

/**
 * Las respuestas van como texto libre o botones, sin plantilla: el toque del
 * instalador abrió la ventana de 24 h. Salen por la línea principal y quedan en
 * su bandeja, como cualquier mensaje.
 */
async function replyText(to: string, text: string, contactId: string): Promise<void> {
  await send(to, contactId, "text", { type: "text", text: { body: text } }, () =>
    sendTextMessage(to, text, primaryLine().phoneNumberId || undefined)
  );
}

async function replyButtons(
  to: string,
  text: string,
  buttons: { id: string; title: string }[],
  contactId: string
): Promise<void> {
  // En el registro no van los ids de los botones: son llaves.
  const content = { type: "interactive", interactive: { type: "button", body: { text }, buttons: buttons.map((b) => b.title) } };
  await send(to, contactId, "interactive", content, () =>
    sendReplyButtons(to, text, buttons, primaryLine().phoneNumberId || undefined)
  );
}

async function send(
  to: string,
  contactId: string,
  type: string,
  content: Prisma.InputJsonValue,
  doSend: () => Promise<WhatsAppSendResponse>
): Promise<void> {
  try {
    const response = await doSend();
    const wamid = response.messages?.[0]?.id;
    if (wamid) await recordOutbound({ wamid, to, type, content, response, contactId });
  } catch (err) {
    const detail = err instanceof WhatsAppApiError ? { code: err.code, status: err.httpStatus } : {};
    log.error({ err: err instanceof Error ? err.message : err, to, ...detail }, "No se pudo responder el botón de turno");
  }
}
