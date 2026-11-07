/**
 * Reglas del envío masivo de plantillas. Módulo puro: lo importan tanto la
 * pantalla (para armar la lista y mostrar el avance) como la ruta (para validar).
 */

/** Cuántos destinatarios viajan por pedido. El avance se ve de a un lote y se puede cortar entre lotes. */
export const BULK_CHUNK = 20;

/** Tope de una tanda. Más que esto ya no es una campaña revisable a ojo: se parte en dos. */
export const BULK_MAX = 500;

/** Cuántos fallos seguidos hacen que la pantalla corte sola (token vencido, límite de Meta, plantilla pausada…). */
export const BULK_MAX_CONSECUTIVE_FAILURES = 5;

export type BulkRecipient = {
  /** Número con código de país, solo dígitos. */
  peer: string;
  /** Nombre para mostrar en el resultado (no viaja a Meta). */
  name: string;
  /** Valores de las variables {{1}}, {{2}}…, ya resueltos para este destinatario. */
  params: string[];
};

export type BulkOutcome =
  | { peer: string; status: "sent" }
  /** Ya había conversación con ese número y se pidió no insistirle. */
  | { peer: string; status: "skipped" }
  | { peer: string; status: "failed"; error: string };

/** Qué valor lleva cada variable de la plantilla. */
export type VariableSource = { kind: "name" } | { kind: "text"; value: string };

/** Resuelve las variables de una plantilla para un destinatario. */
export function resolveParams(sources: VariableSource[], recipientName: string): string[] {
  return sources.map((s) => (s.kind === "name" ? recipientName.trim() || "-" : s.value.trim()));
}

/** Las variables de texto fijo tienen que estar completas; las de nombre siempre están. */
export function variablesComplete(sources: VariableSource[]): boolean {
  return sources.every((s) => s.kind === "name" || s.value.trim().length > 0);
}

/**
 * Deja un destinatario por número. Dos fichas pueden compartir el WhatsApp
 * (una empresa cargada dos veces); mandarle dos veces la misma plantilla en la
 * misma tanda sería insistir.
 */
export function dedupeByPeer<T extends { peer: string }>(items: T[]): { unique: T[]; duplicates: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (seen.has(item.peer)) continue;
    seen.add(item.peer);
    unique.push(item);
  }
  return { unique, duplicates: items.length - unique.length };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type BulkTally = { sent: number; skipped: number; failed: number };

export function tally(outcomes: BulkOutcome[]): BulkTally {
  const t: BulkTally = { sent: 0, skipped: 0, failed: 0 };
  for (const o of outcomes) t[o.status] += 1;
  return t;
}
