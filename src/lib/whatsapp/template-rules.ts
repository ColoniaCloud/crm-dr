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
};

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
};

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
  return null;
}

