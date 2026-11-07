/**
 * Números de WhatsApp: dejarlos como los espera la Cloud API y `wa.me` — solo
 * dígitos y con código de país, sin "+" ni ceros de marcado.
 *
 * Es código puro (sin base ni `server-only`): lo usan las rutas y la pantalla.
 *
 * Países con reglas propias: Argentina (54, y 549 para móviles), Uruguay (598) y
 * Perú (51). Un número que ya trae su código de país —con "+", con "00", o con el
 * prefijo de uno de estos países y el largo que corresponde— se deja como está,
 * y eso incluye a cualquier otro país (Chile 56, Paraguay 595, ...). Lo que
 * viene *sin* código es local y se interpreta según `country`, que por defecto
 * es Argentina.
 *
 * No adivina más que eso: si el número está mal cargado, el mensaje no sale y
 * queda registrado como fallido, que es mejor que mandárselo a un desconocido.
 */

export type WaCountry = "AR" | "UY" | "PE";

/** El país de una ficha según el nombre que tiene cargado ("Uruguay", "Perú", ...). */
export function countryFromName(name: string | null | undefined): WaCountry {
  const n = (name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (n === "uruguay" || n === "uy") return "UY";
  if (n === "peru" || n === "pe") return "PE";
  return "AR";
}

/** El país al que pertenece un número ya normalizado, si es uno de los tres. */
export function waCountryOf(normalized: string): WaCountry | null {
  const d = normalized.replace(/\D/g, "");
  if (d.startsWith("598")) return "UY";
  if (d.startsWith("54")) return "AR";
  if (d.startsWith("51") && d.length === 11) return "PE";
  return null;
}

export function normalizeWhatsappNumber(raw: string, country: WaCountry = "AR"): string {
  const text = (raw || "").trim();
  let d = text.replace(/\D/g, "");
  if (!d) return "";

  // "+51 987..." o "0051 987...": el número ya trae su código de país.
  if (text.startsWith("+")) return d;
  if (d.startsWith("00")) return d.slice(2);

  // Prefijos de los países con reglas propias.
  if (d.startsWith("54") || d.startsWith("598") || d.startsWith("549")) return d;
  // Perú: 51 + celular de 9 dígitos. Con otro largo puede ser un local que casualmente
  // empieza con 51, así que no se toma por código de país.
  if (d.startsWith("51") && d.length === 11) return d;

  // Sin código de país: es un número local de `country`.
  if (country === "PE") {
    if (d.startsWith("0")) d = d.slice(1); // el 0 de marcado nacional solo va delante de fijos
    // Solo los celulares (9 dígitos, empiezan con 9) tienen WhatsApp.
    return d.length === 9 && d.startsWith("9") ? `51${d}` : "";
  }
  if (country === "UY") {
    if (d.startsWith("0")) d = d.slice(1); // 099 123 456 → 99 123 456
    return d.length === 8 ? `598${d}` : "";
  }

  // Argentina (y todo lo que no se sabe de dónde es).
  if (d.startsWith("0")) return "54" + d.slice(1);
  if (d.length <= 10) return "54" + d;
  return d;
}

/** ¿Tiene pinta de número de WhatsApp? (E.164 admite hasta 15 dígitos; menos de 10 no alcanza.) */
export function isPlausibleWhatsappNumber(normalized: string): boolean {
  return /^\d{10,15}$/.test(normalized);
}
