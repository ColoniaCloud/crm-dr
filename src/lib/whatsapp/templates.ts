import {
  createTemplate,
  listTemplates,
  type GraphTemplate,
  type NewGraphButton,
  type NewGraphTemplate,
} from "@/lib/whatsapp/client";
import {
  normalizeButtonPhone,
  stateOf,
  validateNewTemplate,
  type NewTemplateInput,
  type TemplateButton,
  type TemplateButtonView,
  type TemplateRow,
} from "@/lib/whatsapp/template-rules";

export {
  PERU_OUTREACH_TEMPLATE,
  TEMPLATE_LANGUAGES,
  stateOf,
  validateNewTemplate,
  type NewTemplateInput,
  type TemplateButton,
  type TemplateButtonView,
  type TemplateRow,
  type TemplateState,
} from "@/lib/whatsapp/template-rules";

/**
 * Plantillas aprobadas de Meta, listas para ofrecerse en la bandeja.
 *
 * El texto de cada plantilla vive en Meta, no en el CRM: se pide a la Graph API y
 * se guarda 5 minutos en memoria (cambian muy de vez en cuando y la pantalla las
 * pide cada vez que se abre un chat).
 *
 * Desde la bandeja solo se pueden mandar las plantillas que se completan con
 * variables **numéricas del cuerpo** ({{1}}, {{2}}...). Las que llevan un
 * encabezado con imagen o documento, o botones que piden un dato al enviar, se
 * listan pero marcadas como no soportadas, para que el equipo sepa que existen y
 * por qué no se pueden elegir. Los botones fijos (respuesta rápida, link sin
 * variable, llamada) no piden nada: van solos con la plantilla.
 */

export type InboxTemplate = {
  name: string;
  language: string;
  category: string;
  /** Texto del cuerpo, con los {{n}} sin reemplazar. */
  body: string;
  header?: string;
  footer?: string;
  /** Cuántas variables pide el cuerpo ({{1}}..{{n}}). */
  variableCount: number;
  buttons?: TemplateButtonView[];
  /** Por qué no se puede mandar desde la bandeja; ausente si se puede. */
  unsupported?: string;
};

const TTL_MS = 5 * 60 * 1000;

/**
 * Las plantillas son de una cuenta (WABA), y cada línea tiene la suya: la caché
 * va por cuenta, para que una línea nunca ofrezca ni mande las de otra. `""` es
 * la cuenta de las variables de entorno (la línea principal).
 */
const cache = new Map<string, { at: number; items: InboxTemplate[] }>();

export async function getApprovedTemplates(force = false, wabaId = ""): Promise<InboxTemplate[]> {
  const hit = cache.get(wabaId);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.items;
  const items = toInboxTemplates(await listTemplates(wabaId || undefined));
  cache.set(wabaId, { at: Date.now(), items });
  return items;
}

/** Para los tests y para forzar la recarga tras aprobar una plantilla. */
export function clearTemplateCache(): void {
  cache.clear();
  allCache.clear();
}

export function toInboxTemplates(raw: GraphTemplate[]): InboxTemplate[] {
  return raw
    .filter((t) => t.status === "APPROVED")
    .map(toInboxTemplate)
    .sort((a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language));
}

function toInboxTemplate(t: GraphTemplate): InboxTemplate {
  const parts = t.components ?? [];
  const body = parts.find((c) => c.type === "BODY")?.text ?? "";
  const headerPart = parts.find((c) => c.type === "HEADER");
  const footer = parts.find((c) => c.type === "FOOTER")?.text;
  const buttons = parts.find((c) => c.type === "BUTTONS")?.buttons ?? [];

  const nums = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  const variableCount = nums.length ? Math.max(...nums) : 0;

  return {
    name: t.name,
    language: t.language,
    category: t.category ?? "",
    body,
    header: headerPart?.format === "TEXT" ? headerPart.text : undefined,
    footer,
    variableCount,
    ...(buttons.length ? { buttons: toButtonViews(buttons) } : {}),
    unsupported: unsupportedReason(body, headerPart, buttons),
  };
}

type GraphButton = { type: string; text?: string; url?: string; phone_number?: string };

/** Los botones que no piden nada al enviar la plantilla. */
const STATIC_BUTTON_TYPES = new Set(["QUICK_REPLY", "URL", "PHONE_NUMBER", "VOICE_CALL"]);

function toButtonViews(buttons: GraphButton[]): TemplateButtonView[] {
  return buttons.map((b) => ({
    type: b.type,
    text: b.text ?? "",
    ...(b.url ? { url: b.url } : {}),
    ...(b.phone_number ? { phone: b.phone_number } : {}),
  }));
}

function unsupportedReason(
  body: string,
  header: { format?: string; text?: string } | undefined,
  buttons: GraphButton[]
): string | undefined {
  if (header && header.format && header.format !== "TEXT") {
    return "Lleva un encabezado con imagen, video o documento";
  }
  if (header?.text && /\{\{/.test(header.text)) return "El encabezado lleva variables";
  if (/\{\{\s*[^\d\s}][^}]*\}\}/.test(body)) return "Usa variables con nombre en lugar de {{1}}, {{2}}";
  if (buttons.some((b) => b.type === "URL" && /\{\{/.test(b.url ?? ""))) {
    return "Tiene un botón con link variable";
  }
  if (buttons.some((b) => !STATIC_BUTTON_TYPES.has(b.type))) {
    return "Tiene un botón que pide un dato al enviar (código, catálogo o flujo)";
  }
  return undefined;
}

// ─── Todas las plantillas, con su estado ─────────────────────────────────────

export function toTemplateRows(raw: GraphTemplate[]): TemplateRow[] {
  return raw
    .filter((t) => t.status !== "DELETED" && t.status !== "ARCHIVED" && t.status !== "PENDING_DELETION")
    .map((t): TemplateRow => {
      const parts = t.components ?? [];
      const header = parts.find((c) => c.type === "HEADER");
      return {
        id: t.id ?? null,
        name: t.name,
        language: t.language,
        category: t.category ?? "",
        status: t.status,
        state: stateOf(t.status),
        body: parts.find((c) => c.type === "BODY")?.text ?? "",
        header: header?.format === "TEXT" ? header.text : undefined,
        footer: parts.find((c) => c.type === "FOOTER")?.text,
        rejectedReason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : undefined,
        ...(buttonsOf(parts).length ? { buttons: toButtonViews(buttonsOf(parts)) } : {}),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language));
}

const buttonsOf = (parts: NonNullable<GraphTemplate["components"]>): GraphButton[] =>
  parts.find((c) => c.type === "BUTTONS")?.buttons ?? [];

const ALL_TTL_MS = 60 * 1000;
const allCache = new Map<string, { at: number; rows: TemplateRow[] }>();

/** Todas las plantillas de una cuenta con su estado (caché de 1 min; `force` la salta). */
export async function getAllTemplates(force = false, wabaId = ""): Promise<TemplateRow[]> {
  const hit = allCache.get(wabaId);
  if (!force && hit && Date.now() - hit.at < ALL_TTL_MS) return hit.rows;
  const rows = toTemplateRows(await listTemplates(wabaId || undefined));
  allCache.set(wabaId, { at: Date.now(), rows });
  return rows;
}

// ─── Crear una plantilla ─────────────────────────────────────────────────────

function toGraphButton(b: TemplateButton): NewGraphButton {
  const text = b.text.trim();
  if (b.type === "URL") return { type: "URL", text, url: b.url.trim() };
  if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text, phone_number: normalizeButtonPhone(b.phone) };
  return { type: "QUICK_REPLY", text };
}

/**
 * Valida y manda la plantilla a revisión, en la cuenta que se pasa (o la
 * principal). Tira `Error` con un mensaje legible si no pasa la validación.
 */
export async function submitNewTemplate(t: NewTemplateInput, wabaId = "") {
  const problem = validateNewTemplate(t);
  if (problem) throw new Error(problem);

  const components: NewGraphTemplate["components"] = [];
  if (t.header?.trim()) components.push({ type: "HEADER", format: "TEXT", text: t.header.trim() });
  const variables = new Set([...t.body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1])).size;
  components.push({
    type: "BODY",
    text: t.body.trim(),
    ...(variables ? { example: { body_text: [t.examples.map((e) => e.trim())] } } : {}),
  });
  if (t.footer?.trim()) components.push({ type: "FOOTER", text: t.footer.trim() });
  if (t.buttons?.length) components.push({ type: "BUTTONS", buttons: t.buttons.map(toGraphButton) });

  const template = { name: t.name, language: t.language, category: t.category, components };
  const created = wabaId ? await createTemplate(template, wabaId) : await createTemplate(template);
  allCache.delete(wabaId);
  cache.delete(wabaId);
  return created;
}
