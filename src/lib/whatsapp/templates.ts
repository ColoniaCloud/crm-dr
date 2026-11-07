import { listTemplates, type GraphTemplate } from "@/lib/whatsapp/client";

/**
 * Plantillas aprobadas de Meta, listas para ofrecerse en la bandeja.
 *
 * El texto de cada plantilla vive en Meta, no en el CRM: se pide a la Graph API y
 * se guarda 5 minutos en memoria (cambian muy de vez en cuando y la pantalla las
 * pide cada vez que se abre un chat).
 *
 * Desde la bandeja solo se pueden mandar las plantillas que se completan con
 * variables **numéricas del cuerpo** ({{1}}, {{2}}...). Las que llevan un
 * encabezado con imagen o documento, o botones con variables, se listan pero
 * marcadas como no soportadas, para que el equipo sepa que existen y por qué no
 * se pueden elegir.
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
  /** Por qué no se puede mandar desde la bandeja; ausente si se puede. */
  unsupported?: string;
};

const TTL_MS = 5 * 60 * 1000;

let cache: { at: number; items: InboxTemplate[] } | null = null;

export async function getApprovedTemplates(force = false): Promise<InboxTemplate[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.items;
  const items = toInboxTemplates(await listTemplates());
  cache = { at: Date.now(), items };
  return items;
}

/** Para los tests y para forzar la recarga tras aprobar una plantilla. */
export function clearTemplateCache(): void {
  cache = null;
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
    unsupported: unsupportedReason(body, headerPart, buttons),
  };
}

function unsupportedReason(
  body: string,
  header: { format?: string; text?: string } | undefined,
  buttons: { type: string; text?: string; url?: string }[]
): string | undefined {
  if (header && header.format && header.format !== "TEXT") {
    return "Lleva un encabezado con imagen, video o documento";
  }
  if (header?.text && /\{\{/.test(header.text)) return "El encabezado lleva variables";
  if (/\{\{\s*[^\d\s}][^}]*\}\}/.test(body)) return "Usa variables con nombre en lugar de {{1}}, {{2}}";
  if (buttons.some((b) => b.type === "URL" && /\{\{/.test(b.url ?? ""))) {
    return "Tiene un botón con link variable";
  }
  return undefined;
}
