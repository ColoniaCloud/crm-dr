/**
 * Horario de un agente: una hora del día ("09:00") y los días de la semana en
 * que trabaja, en hora de Buenos Aires.
 *
 * Argentina no tiene horario de verano desde 2009, así que alcanza con un
 * corrimiento fijo de −3 h y no hace falta una librería de zonas horarias.
 */
const OFFSET_MS = -3 * 60 * 60_000;

export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const DAY_LABELS: Record<number, string> = {
  1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 7: "Dom",
};

export function parseDays(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((d) => Number(d.trim())))]
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
    .sort();
}

export function isValidTime(raw: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw);
}

/**
 * Próxima vez que le toca trabajar, estrictamente después de `from`. Null si no
 * tiene horario (solo corre con "Ejecutar ahora").
 */
export function nextRunAfter(
  time: string | null | undefined,
  daysRaw: string | null | undefined,
  from: Date = new Date()
): Date | null {
  const days = parseDays(daysRaw);
  if (!time || !isValidTime(time) || days.length === 0) return null;
  const [hh, mm] = time.split(":").map(Number);

  // "Hoy" en Buenos Aires, expresado como fecha UTC a medianoche local.
  const local = new Date(from.getTime() + OFFSET_MS);
  for (let i = 0; i < 8; i++) {
    const dia = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i));
    const isoDow = dia.getUTCDay() === 0 ? 7 : dia.getUTCDay();
    if (!days.includes(isoDow)) continue;
    const candidato = new Date(dia.getTime() + (hh * 60 + mm) * 60_000 - OFFSET_MS);
    if (candidato > from) return candidato;
  }
  return null;
}

/** Medianoche de Buenos Aires del día de `d`, como instante UTC. Sirve para contar días de calendario. */
export function startOfLocalDay(d: Date): Date {
  const local = new Date(d.getTime() + OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET_MS);
}

/** Días de calendario (Buenos Aires) entre dos fechas: positivo si `b` es posterior a `a`. */
export function calendarDaysBetween(a: Date, b: Date): number {
  return Math.round((startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime()) / 86_400_000);
}

/** "2026-10" del mes en curso, en Buenos Aires. */
export function monthKey(d: Date = new Date()): string {
  const local = new Date(d.getTime() + OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Primer instante del mes en curso de Buenos Aires. */
export function startOfLocalMonth(d: Date = new Date()): Date {
  const local = new Date(d.getTime() + OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - OFFSET_MS);
}

export function formatLocalDate(d: Date): string {
  return d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}
