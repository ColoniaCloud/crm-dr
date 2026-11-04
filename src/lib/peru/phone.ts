/**
 * Normalización de teléfonos peruanos.
 *
 * Plan de numeración: los celulares tienen 9 dígitos y empiezan con 9
 * (+51 9XX XXX XXX) y son los únicos con WhatsApp. Los fijos son el código de
 * área (1 dígito en Lima, 2 en el resto) más 6-7 dígitos: 8 en total con el
 * código, 9 si se cuenta el 0 de marcado nacional (01, 044, 054...).
 */

export type PeruPhone = {
  /** E.164 (+51987654321), o "" si no se pudo interpretar. */
  phone: string;
  /** Dígitos con prefijo de país para wa.me (51987654321); "" si no es celular. */
  whatsapp: string;
  type: "mobile" | "landline" | "unknown";
};

const EMPTY: PeruPhone = { phone: "", whatsapp: "", type: "unknown" };

export function normalizePeruPhone(raw: string | null | undefined): PeruPhone {
  if (!raw) return EMPTY;

  // Un campo puede traer varios números ("987 654 321 / 01 444 5555"): el primero.
  const first = raw.split(/[\/;,]| o /i)[0] ?? raw;
  let digits = first.replace(/\D/g, "");
  if (!digits) return EMPTY;

  // Prefijo de discado internacional (00 51 ...) y de país (51).
  if (digits.startsWith("0051")) digits = digits.slice(4);
  else if (digits.startsWith("51") && digits.length >= 10) digits = digits.slice(2);

  // Un 0 de marcado nacional solo aparece delante de fijos: 01, 044, 054...
  if (digits.startsWith("0")) digits = digits.slice(1);

  if (digits.length === 9 && digits.startsWith("9")) {
    return { phone: `+51${digits}`, whatsapp: `51${digits}`, type: "mobile" };
  }

  // Fijo: Lima = 1 + 7 dígitos; provincias = 2 dígitos de área + 6.
  if (digits.length === 8 && /^[1-8]/.test(digits)) {
    return { phone: `+51${digits}`, whatsapp: "", type: "landline" };
  }

  return EMPTY;
}

/** Normaliza un número de WhatsApp suelto (link wa.me del sitio del negocio). */
export function normalizePeruWhatsApp(raw: string | null | undefined): string {
  const n = normalizePeruPhone(raw);
  return n.type === "mobile" ? n.whatsapp : "";
}

/** Para mostrar: +51 987 654 321 / +51 1 444 5555 / +51 44 123 456. */
export function formatPeruPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (!d.startsWith("51")) return e164;
  const local = d.slice(2);
  if (local.length === 9) return `+51 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  if (local.length === 8 && local.startsWith("1")) return `+51 1 ${local.slice(1, 4)} ${local.slice(4)}`;
  if (local.length === 8) return `+51 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  return e164;
}
