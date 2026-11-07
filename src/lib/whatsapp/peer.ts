/**
 * Con quién es una conversación de WhatsApp.
 *
 * Una conversación no tiene tabla propia: es el conjunto de mensajes de
 * `whatsapp_cloud_messages` cuyo "otro lado" es el mismo número. Ese número hay
 * que normalizarlo porque Meta no siempre lo escribe igual: a los móviles
 * argentinos los puede mostrar como `549 11 ...` (13 dígitos) o como `54 11 ...`
 * (12). Sin unificarlos, la misma persona aparecería como dos chats.
 *
 * Es código puro, sin acceso a base ni a `server-only`, porque lo usan tanto
 * las rutas como la pantalla.
 */

/** Clave canónica del chat: solo dígitos, y el móvil argentino sin el 9. */
export function peerKey(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("549") && d.length === 13) return "54" + d.slice(3);
  return d;
}

/** Las formas en que Meta puede haber escrito el número de esa clave. */
export function peerVariants(key: string): string[] {
  const out = new Set<string>([key]);
  if (key.startsWith("54") && !key.startsWith("549") && key.length === 12) {
    out.add("549" + key.slice(2));
  }
  return [...out];
}

/** Si una cadena parece un número de WhatsApp (solo dígitos, largo razonable). */
export function looksLikeWaNumber(raw: string): boolean {
  return /^\d{8,16}$/.test(raw);
}

/** Cómo mostrar un número cuando no hay nombre: `+54 9 11 ...`. */
export function formatWaNumber(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  return d ? `+${d}` : "";
}
