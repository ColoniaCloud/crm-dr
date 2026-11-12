/**
 * Reglas y tipos de las plantillas que no dependen del servidor: los usan tanto
 * las rutas como las pantallas, así que acá no hay nada de base ni de la Graph
 * API (importar `templates.ts` desde el navegador arrastraría el cliente de Meta).
 */

/** La plantilla de presentación para la campaña de Perú (ver `peru-whatsapp-button`). */
export const PERU_OUTREACH_TEMPLATE = "kristall_visita_peru";

/** El estado de una plantilla, en los términos que importan para quien opera. */
export type TemplateState = "approved" | "pending" | "rejected" | "paused";

export type TemplateRow = {
  id: string | null;
  name: string;
  language: string;
  category: string;
  /** Estado crudo de Meta (APPROVED, PENDING, REJECTED, PAUSED, ...). */
  status: string;
  state: TemplateState;
  body: string;
  header?: string;
  footer?: string;
  /** Motivo del rechazo, si Meta lo informó. */
  rejectedReason?: string;
  /** Los botones, tal como los tiene Meta (pueden ser de un tipo que el CRM no crea). */
  buttons?: TemplateButtonView[];
};

/** Un botón de una plantilla que ya existe en Meta, para mostrarlo. */
export type TemplateButtonView = { type: string; text: string; url?: string; phone?: string };

export function stateOf(status: string): TemplateState {
  switch (status) {
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "PENDING":
    case "IN_APPEAL":
      return "pending";
    // PAUSED, DISABLED, FLAGGED, LIMIT_EXCEEDED...: existe pero no se puede mandar.
    default:
      return "paused";
  }
}


/** Idiomas con los que se ofrece crear plantillas (códigos de Meta). */
export const TEMPLATE_LANGUAGES = [
  { code: "es_AR", label: "Español (Argentina)" },
  { code: "es_PE", label: "Español (Perú)" },
  { code: "es_UY", label: "Español (Uruguay)" },
  { code: "es_CL", label: "Español (Chile)" },
  { code: "es_CO", label: "Español (Colombia)" },
  { code: "es_MX", label: "Español (México)" },
  { code: "es_ES", label: "Español (España)" },
  { code: "es", label: "Español" },
  { code: "pt_BR", label: "Portugués (Brasil)" },
  { code: "en_US", label: "Inglés (EE.UU.)" },
] as const;

export type NewTemplateInput = {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING";
  header?: string;
  body: string;
  footer?: string;
  /** Un valor de ejemplo por cada {{n}} del cuerpo (Meta los exige para aprobar). */
  examples: string[];
  buttons?: TemplateButton[];
};

// ─── Botones ─────────────────────────────────────────────────────────────────

/**
 * Los botones que se pueden crear desde el CRM: respuesta rápida, link fijo y
 * llamada. Meta tiene más (copiar código, link con variable, flujos, catálogo),
 * pero esos piden completar algo al mandar la plantilla y el envío del CRM
 * todavía no lo hace.
 */
export type TemplateButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone: string };

export type TemplateButtonType = TemplateButton["type"];

/**
 * Los topes de Meta para los botones de una plantilla.
 * Fuente: "Template components" (developers.facebook.com, revisado el 2026-11-12).
 */
export const BUTTON_LIMITS = {
  /** Botones en total. */
  total: 10,
  /** Botones de link. */
  url: 2,
  /** Botones de llamada. */
  phone: 1,
  /** Largo del texto de cualquier botón. */
  text: 25,
  urlLength: 2000,
  phoneLength: 20,
} as const;

export const BUTTON_TYPE_LABEL: Record<TemplateButtonType, string> = {
  QUICK_REPLY: "Respuesta rápida",
  URL: "Link",
  PHONE_NUMBER: "Llamada",
};

/** El teléfono de un botón de llamada como lo quiere Meta: solo dígitos, con el código de país. */
export function normalizeButtonPhone(phone: string): string {
  return (phone ?? "").replace(/\D/g, "");
}

const nth = (i: number) => `Botón ${i + 1}`;

/**
 * Las reglas de formato de Meta para los botones. Son las que la API rechaza de
 * plano (largos, cantidades, agrupación), así que acá bloquean siempre: no se le
 * deja a la IA algo que tiene una respuesta exacta.
 */
export function validateButtons(buttons: TemplateButton[]): string | null {
  if (buttons.length > BUTTON_LIMITS.total) return `Una plantilla puede tener hasta ${BUTTON_LIMITS.total} botones.`;

  for (const [i, b] of buttons.entries()) {
    const text = b.text.trim();
    if (!text) return `${nth(i)}: falta el texto.`;
    if (text.length > BUTTON_LIMITS.text) return `${nth(i)}: el texto puede tener hasta ${BUTTON_LIMITS.text} caracteres.`;
    if (/[\r\n]/.test(text) || /\{\{/.test(text)) return `${nth(i)}: el texto es una sola línea, sin variables.`;

    if (b.type === "URL") {
      const url = b.url.trim();
      if (!url) return `${nth(i)}: falta el link.`;
      if (/\{\{/.test(url)) return `${nth(i)}: los links con variable todavía no se pueden crear desde acá.`;
      if (url.length > BUTTON_LIMITS.urlLength) return `${nth(i)}: el link puede tener hasta ${BUTTON_LIMITS.urlLength} caracteres.`;
      if (!isWebUrl(url)) return `${nth(i)}: el link tiene que ser una dirección completa, con https://`;
    } else if (b.type === "PHONE_NUMBER") {
      const digits = normalizeButtonPhone(b.phone);
      if (!digits) return `${nth(i)}: falta el teléfono.`;
      if (digits.length < 8 || digits.length > 15) {
        return `${nth(i)}: el teléfono va completo, con el código de país (por ejemplo 54 9 11 5555-1234).`;
      }
    } else if (b.type !== "QUICK_REPLY") {
      return `${nth(i)}: tipo de botón no soportado.`;
    }
  }

  const count = (type: TemplateButtonType) => buttons.filter((b) => b.type === type).length;
  if (count("URL") > BUTTON_LIMITS.url) return `Una plantilla puede tener hasta ${BUTTON_LIMITS.url} botones de link.`;
  if (count("PHONE_NUMBER") > BUTTON_LIMITS.phone) return "Una plantilla puede tener un solo botón de llamada.";

  const texts = buttons.map((b) => b.text.trim().toLowerCase());
  if (new Set(texts).size !== texts.length) return "Dos botones no pueden tener el mismo texto.";

  // Meta exige dos grupos: las respuestas rápidas juntas y el resto junto.
  const groups = buttons.map((b) => b.type === "QUICK_REPLY");
  const switches = groups.filter((g, i) => i > 0 && g !== groups[i - 1]).length;
  if (switches > 1) {
    return "Las respuestas rápidas tienen que ir juntas: todas antes o todas después de los otros botones.";
  }
  return null;
}

function isWebUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Cosas que Meta acepta pero conviene saber antes de mandar: no bloquean.
 * Las dos salen de la misma página de la documentación que los topes.
 */
export function buttonNotices(buttons: TemplateButton[]): string[] {
  const notices: string[] = [];
  const quick = buttons.some((b) => b.type === "QUICK_REPLY");
  const other = buttons.some((b) => b.type !== "QUICK_REPLY");
  if (buttons.length >= 4 || (quick && other)) {
    notices.push(
      "Con 4 botones o más, o mezclando respuestas rápidas con otro tipo, el mensaje no se ve en WhatsApp de escritorio: le pide a la persona que lo abra en el celular."
    );
  }
  if (buttons.length > 3) {
    notices.push("Con más de 3 botones se ven los dos primeros y un «Ver todas las opciones» con el resto.");
  }
  return notices;
}

/** Las reglas de formato de Meta, para avisar antes de mandar y no recibir un rechazo críptico. */
export function validateNewTemplate(t: NewTemplateInput): string | null {
  if (!/^[a-z0-9_]{1,512}$/.test(t.name)) {
    return "El nombre solo puede tener minúsculas, números y guion bajo (sin espacios ni tildes).";
  }
  if (!TEMPLATE_LANGUAGES.some((l) => l.code === t.language)) return "Idioma no soportado.";
  if (t.category !== "UTILITY" && t.category !== "MARKETING") return "Categoría no soportada.";

  const body = t.body.trim();
  if (!body) return "El cuerpo no puede estar vacío.";
  if (body.length > 1024) return "El cuerpo puede tener hasta 1024 caracteres.";
  if (/\n{3,}/.test(body)) return "Dejá como máximo una línea en blanco entre párrafos.";

  const nums = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  if (/\{\{\s*[^\d\s}][^}]*\}\}/.test(body)) return "Las variables son {{1}}, {{2}}, ... (sin nombres).";
  const distinct = [...new Set(nums)].sort((a, b) => a - b);
  if (distinct.some((n, i) => n !== i + 1)) return "Las variables tienen que ser {{1}}, {{2}}, ... seguidas y sin saltos.";
  if (distinct.length) {
    if (/^\s*\{\{/.test(body) || /\}\}\s*$/.test(body)) return "El cuerpo no puede empezar ni terminar con una variable.";
    if (/\{\{\s*\d+\s*\}\}[\s.,;:!?¡¿-]*\{\{/.test(body)) return "Dos variables no pueden ir pegadas: separalas con palabras.";
    if (body.replace(/\{\{\s*\d+\s*\}\}/g, "").trim().split(/\s+/).length < distinct.length * 3) {
      return "Hay demasiadas variables para el largo del texto: agregá más texto.";
    }
    if (t.examples.length !== distinct.length || t.examples.some((e) => !e.trim())) {
      return `Completá un ejemplo para cada variable (${distinct.length}).`;
    }
  }

  if (t.header !== undefined && t.header.trim()) {
    if (t.header.length > 60) return "El encabezado puede tener hasta 60 caracteres.";
    if (/[\r\n]/.test(t.header) || /\{\{/.test(t.header)) return "El encabezado es una sola línea, sin variables.";
  }
  if (t.footer !== undefined && t.footer.trim()) {
    if (t.footer.length > 60) return "El pie puede tener hasta 60 caracteres.";
    if (/[\r\n]/.test(t.footer) || /\{\{/.test(t.footer)) return "El pie es una sola línea, sin variables.";
  }
  if (t.buttons?.length) return validateButtons(t.buttons);
  return null;
}

