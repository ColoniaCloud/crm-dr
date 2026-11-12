/**
 * Le agrega `?line=<key>` a una URL de la API de WhatsApp. Sin línea la deja
 * igual: el servidor usa la que esa persona tiene por defecto.
 *
 * El parámetro solo elige entre las líneas que el servidor ya le permite a esa
 * persona (ver `line-access.ts`); no da acceso a nada.
 */
export function withLine(url: string, line?: string | null): string {
  if (!line) return url;
  return `${url}${url.includes("?") ? "&" : "?"}line=${encodeURIComponent(line)}`;
}
