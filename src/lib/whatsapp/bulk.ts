import { createLogger } from "@/lib/logger";
import type { BulkOutcome, BulkRecipient } from "@/lib/whatsapp/bulk-rules";
import { InboxSendError, getPeerStatus, sendToPeer } from "@/lib/whatsapp/inbox";
import { looksLikeWaNumber, peerKey } from "@/lib/whatsapp/peer";

const log = createLogger("lib/whatsapp/bulk");

/**
 * Manda una plantilla a un lote de números, de a uno y en orden.
 *
 * Cada envío es el mismo que hace la bandeja (`sendToPeer`): valida la plantilla
 * contra las aprobadas, deja el registro del saliente y respeta el modo demo. Acá
 * solo se suma lo propio de mandar a muchos:
 *
 *   - un fallo no corta el lote: queda anotado en ese destinatario y sigue el resto;
 *   - con `skipExisting`, a quien ya tiene conversación no se le manda (la
 *     presentación a alguien que ya recibió el mensaje es insistir);
 *   - nunca tira por un destinatario: devuelve un resultado por cada uno, en el
 *     mismo orden en que llegaron.
 */
export async function sendTemplateBatch(args: {
  template: { name: string; language: string };
  recipients: BulkRecipient[];
  skipExisting: boolean;
  userId: string;
}): Promise<BulkOutcome[]> {
  const outcomes: BulkOutcome[] = [];

  for (const recipient of args.recipients) {
    const peer = peerKey(recipient.peer);
    if (!looksLikeWaNumber(peer)) {
      outcomes.push({ peer: recipient.peer, status: "failed", error: "Número inválido" });
      continue;
    }

    try {
      if (args.skipExisting && (await getPeerStatus(peer)).hasConversation) {
        outcomes.push({ peer: recipient.peer, status: "skipped" });
        continue;
      }

      await sendToPeer(
        peer,
        { kind: "template", name: args.template.name, language: args.template.language, params: recipient.params },
        args.userId
      );
      outcomes.push({ peer: recipient.peer, status: "sent" });
    } catch (err) {
      if (err instanceof InboxSendError) {
        outcomes.push({ peer: recipient.peer, status: "failed", error: err.message });
      } else {
        log.error({ err, peer }, "Error inesperado en el envío masivo");
        outcomes.push({ peer: recipient.peer, status: "failed", error: "No se pudo enviar el mensaje" });
      }
    }
  }

  return outcomes;
}
