/**
 * Deja el número como lo espera la Cloud API: solo dígitos y con código de país.
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
