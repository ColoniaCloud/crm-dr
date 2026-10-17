/**
 * Períodos del dashboard (semana o mes), calculados en hora argentina.
 *
 * El servidor corre en UTC (VPS en Docker) y el negocio en Argentina (UTC-3,
 * sin horario de verano). Si los cortes se calcularan con la hora del servidor,
 * una venta del 31 a las 22:00 caería en el mes siguiente. Por eso cada corte
 * es la medianoche argentina expresada en UTC: `Date.UTC(y, m, d, 3)`.
 *
 * Es un archivo puro (sin Prisma) para que la pantalla arme el selector de
 * períodos con la misma cuenta que usa la API.
 *
 * Claves:
 * - mes:    "2026-10"      → del 1/10 00:00 al 1/11 00:00 (exclusivo)
 * - semana: "2026-10-12"   → el lunes que la empieza, siete días
 */

export type PeriodType = "week" | "month";

const AR_OFFSET_HOURS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTHS_LONG = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Medianoche argentina del día y/m/d, como instante UTC. */
function arMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, AR_OFFSET_HOURS));
}

/** Fecha de calendario argentina (año, mes 0-11, día) de un instante. */
export function arCalendar(date: Date): { y: number; m: number; d: number; weekday: number } {
  const shifted = new Date(date.getTime() - AR_OFFSET_HOURS * 60 * 60 * 1000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate(), weekday: shifted.getUTCDay() };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Clave del período que contiene `date`. */
export function periodKeyFor(type: PeriodType, date: Date = new Date()): string {
  const { y, m, d, weekday } = arCalendar(date);
  if (type === "month") return `${y}-${pad(m + 1)}`;
  const mondayOffset = (weekday + 6) % 7; // lunes = 0
  const monday = new Date(Date.UTC(y, m, d) - mondayOffset * DAY_MS);
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

/** Rango [from, to) de un período. Devuelve null si la clave no es válida. */
export function periodRange(type: PeriodType, key: string): { from: Date; to: Date } | null {
  if (type === "month") {
    const m = /^(\d{4})-(\d{2})$/.exec(key);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    if (mo < 0 || mo > 11) return null;
    return { from: arMidnight(y, mo, 1), to: arMidnight(y, mo + 1, 1) };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const from = arMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(from.getTime())) return null;
  return { from, to: new Date(from.getTime() + 7 * DAY_MS) };
}

/** Texto corto para mostrar: "Oct 2026" o "12–18 oct". */
export function periodLabel(type: PeriodType, key: string): string {
  const range = periodRange(type, key);
  if (!range) return key;
  const a = arCalendar(range.from);
  if (type === "month") return `${MONTHS_LONG[a.m]} ${a.y}`;
  const b = arCalendar(new Date(range.to.getTime() - DAY_MS));
  const fmt = (c: { m: number; d: number }) => `${c.d} ${MONTHS[c.m].toLowerCase()}`;
  return a.m === b.m ? `${a.d}–${fmt(b)}` : `${fmt(a)} – ${fmt(b)}`;
}

/** Los últimos `count` períodos, del actual hacia atrás. Para el selector. */
export function recentPeriods(type: PeriodType, count: number, now: Date = new Date()): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  let key = periodKeyFor(type, now);
  for (let i = 0; i < count; i++) {
    out.push({ key, label: periodLabel(type, key) });
    const range = periodRange(type, key)!;
    // Un instante dentro del período anterior: un día antes del inicio.
    key = periodKeyFor(type, new Date(range.from.getTime() - DAY_MS));
  }
  return out;
}

/** Etiqueta de eje para el gráfico: "Oct", "S 12/10", "12/10". */
export function bucketAxisLabel(granularity: "month" | "week" | "day", from: Date): string {
  const c = arCalendar(from);
  if (granularity === "month") return `${MONTHS[c.m]}${c.m === 0 ? ` ${String(c.y).slice(2)}` : ""}`;
  if (granularity === "week") return `${c.d}/${c.m + 1}`;
  return `${c.d}/${c.m + 1}`;
}

/** Los `count` cortes del gráfico que terminan en el período actual, en orden cronológico. */
export function chartBuckets(
  granularity: "month" | "week" | "day",
  count: number,
  now: Date = new Date()
): { from: Date; to: Date; label: string }[] {
  const out: { from: Date; to: Date; label: string }[] = [];
  if (granularity === "day") {
    const { y, m, d } = arCalendar(now);
    for (let i = count - 1; i >= 0; i--) {
      const from = arMidnight(y, m, d - i);
      out.push({ from, to: new Date(from.getTime() + DAY_MS), label: bucketAxisLabel("day", from) });
    }
    return out;
  }
  const periods = recentPeriods(granularity, count, now).reverse();
  for (const p of periods) {
    const r = periodRange(granularity, p.key)!;
    out.push({ ...r, label: bucketAxisLabel(granularity, r.from) });
  }
  return out;
}
