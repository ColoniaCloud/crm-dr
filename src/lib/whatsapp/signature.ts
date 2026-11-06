import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valida el header `X-Hub-Signature-256` de un webhook de Meta.
 *
 * Meta firma el body **crudo** con HMAC-SHA256 usando el App Secret, y manda
 * `sha256=<hex>`. Hay que firmar los bytes tal como llegaron: si se parsea el
 * JSON y se vuelve a serializar, cualquier diferencia de espacios o de orden de
 * claves invalida la firma.
 *
 * Devuelve `false` ante cualquier cosa rara (header ausente, formato distinto,
 * secret sin configurar). Nunca tira.
 */
export function isValidMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string | undefined
): boolean {
  if (!appSecret || !header) return false;

  const prefix = "sha256=";
  if (!header.startsWith(prefix)) return false;

  const received = Buffer.from(header.slice(prefix.length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();

  // `timingSafeEqual` tira si los largos difieren, y un hex mal formado produce
  // un buffer más corto: se descarta antes de comparar.
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

/**
 * Compara dos strings en tiempo constante sin filtrar el largo del secreto.
 * Se usa para el `hub.verify_token` del GET de verificación.
 */
export function safeEqualStrings(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
