import { prisma } from "@/lib/prisma";
import { peerKey } from "@/lib/whatsapp/peer";

/**
 * Los números con los que ya hubo algún mensaje de WhatsApp, en cualquier sentido
 * (les escribimos o nos escribieron), como claves de conversación (`peerKey`).
 *
 * Es lo mismo que decide la bandeja para saber si "ya hay conversación". Se arma
 * con dos `GROUP BY` en la base y no trae los mensajes.
 */
export async function getWrittenPeers(): Promise<Set<string>> {
  const [sentTo, receivedFrom] = await Promise.all([
    prisma.whatsAppCloudMessage.groupBy({ by: ["to"], where: { direction: "outbound" } }),
    prisma.whatsAppCloudMessage.groupBy({ by: ["from"], where: { direction: "inbound" } }),
  ]);

  const peers = new Set<string>();
  for (const row of sentTo) peers.add(peerKey(row.to));
  for (const row of receivedFrom) peers.add(peerKey(row.from));
  peers.delete("");
  return peers;
}

/** Si ya hubo mensajes con ese WhatsApp (en cualquier sentido). Sin número, nunca. */
export function hasWhatsappConversation(whatsapp: string | null | undefined, written: Set<string>): boolean {
  return Boolean(whatsapp) && written.has(peerKey(whatsapp as string));
}

/**
 * Si a un contacto ya se lo contactó: lo marcó alguien a mano o hay mensajes de
 * WhatsApp con él. La marca manual sola se queda corta: no se entera de lo que se
 * escribió desde la app de WhatsApp Business ni desde el botón de la lista.
 */
export function isReached(
  contact: { contacted: boolean; whatsapp: string | null },
  written: Set<string>
): boolean {
  return contact.contacted || hasWhatsappConversation(contact.whatsapp, written);
}

export type WhatsappActivityFilter = "never" | "written";

/**
 * Se queda con los contactos a los que nunca se les escribió por WhatsApp
 * (`never`) o a los que sí (`written`). Un contacto sin WhatsApp no cuenta como
 * ninguna de las dos: no hay a dónde escribirle, y "nunca se le escribió" tiene
 * que ser una lista de gente a la que se puede escribir.
 */
export function filterByWhatsappActivity<T extends { whatsapp: string | null }>(
  contacts: T[],
  written: Set<string>,
  mode: WhatsappActivityFilter
): T[] {
  return contacts.filter((c) => {
    if (!c.whatsapp) return false;
    const has = hasWhatsappConversation(c.whatsapp, written);
    return mode === "written" ? has : !has;
  });
}
