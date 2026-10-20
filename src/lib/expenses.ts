/**
 * Control de gastos — la cuenta pura, sin Prisma, para que la pantalla y la API
 * usen exactamente la misma.
 *
 * Los meses viajan como clave "YYYY-MM", la misma de `periodKeyFor("month")` en
 * src/lib/dashboard-periods.ts: así "el mes de un pago" se calcula en hora
 * argentina igual que en el dashboard.
 *
 * Prorrateo: un gasto con período reparte su monto en partes iguales entre los
 * meses que cubre. Los centavos que no dividen exacto van al último mes, para
 * que la suma de las partes sea el monto al centavo (un seguro de $100.000 en 3
 * meses es 33.333,33 + 33.333,33 + 33.333,34, no 99.999,99).
 */
import { periodKeyFor } from "@/lib/dashboard-periods";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Tope de meses de un período: cinco años. Más que eso es casi seguro un error de tipeo. */
export const MAX_PERIOD_MONTHS = 60;

export function isMonthKey(v: unknown): v is string {
  return typeof v === "string" && MONTH_RE.test(v);
}

/** Mes calendario argentino de un instante. */
export function monthKeyOf(date: Date): string {
  return periodKeyFor("month", date);
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Cantidad de meses de `from` a `to`, ambos incluidos. 0 si `to` es anterior. */
export function monthSpan(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return Math.max(0, (ty - fy) * 12 + (tm - fm) + 1);
}

/** Los meses de `from` a `to`, ambos incluidos. */
export function monthRange(from: string, to: string): string[] {
  const n = monthSpan(from, to);
  return Array.from({ length: n }, (_, i) => addMonths(from, i));
}

const MONTHS_LONG = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function monthLabel(key: string, short = false): string {
  const [y, m] = key.split("-").map(Number);
  return `${(short ? MONTHS_SHORT : MONTHS_LONG)[m - 1]} ${y}`;
}

/** "Ene 2026 – Dic 2026", o un solo mes si empieza y termina en el mismo. */
export function periodLabel(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  return start === end ? monthLabel(start, true) : `${monthLabel(start, true)} – ${monthLabel(end, true)}`;
}

/**
 * Valida el período que viene de un formulario. Los dos vacíos es "sin
 * período"; uno solo, un período invertido o uno de más de cinco años es error.
 */
export function validatePeriod(
  start: unknown,
  end: unknown
): { ok: true; periodStart: string | null; periodEnd: string | null } | { ok: false; error: string } {
  const s = start === "" || start == null ? null : start;
  const e = end === "" || end == null ? null : end;
  if (s === null && e === null) return { ok: true, periodStart: null, periodEnd: null };
  if (!isMonthKey(s) || !isMonthKey(e)) {
    return { ok: false, error: "El período necesita mes de inicio y de fin (AAAA-MM)" };
  }
  const span = monthSpan(s, e);
  if (span === 0) return { ok: false, error: "El período termina antes de empezar" };
  if (span > MAX_PERIOD_MONTHS) {
    return { ok: false, error: `El período no puede cubrir más de ${MAX_PERIOD_MONTHS} meses` };
  }
  return { ok: true, periodStart: s, periodEnd: e };
}

/**
 * En qué meses pesa un gasto y cuánto en cada uno, en pesos.
 * Sin período: todo en el mes en que se pagó.
 */
export function expenseMonthlyShares(expense: {
  amountARS: number;
  paidAt: Date;
  periodStart: string | null;
  periodEnd: string | null;
}): { month: string; amount: number }[] {
  if (!expense.periodStart || !expense.periodEnd) {
    return [{ month: monthKeyOf(expense.paidAt), amount: expense.amountARS }];
  }
  const months = monthRange(expense.periodStart, expense.periodEnd);
  if (months.length === 0) return [{ month: monthKeyOf(expense.paidAt), amount: expense.amountARS }];
  const totalCents = Math.round(expense.amountARS * 100);
  const baseCents = Math.floor(totalCents / months.length);
  const lastCents = totalCents - baseCents * (months.length - 1);
  return months.map((month, i) => ({
    month,
    amount: (i === months.length - 1 ? lastCents : baseCents) / 100,
  }));
}

/** Monto en pesos de un importe que puede venir en USD. */
export function toARS(amount: number, currency: string, exchangeRate: number | null): number {
  if (currency !== "USD") return amount;
  return exchangeRate && exchangeRate > 0 ? amount * exchangeRate : amount;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** ¿Le corresponde a este recurrente un gasto en `month`? */
export function recurringAppliesTo(
  r: { active: boolean; startMonth: string; endMonth: string | null },
  month: string
): boolean {
  if (!r.active) return false;
  if (month < r.startMonth) return false;
  if (r.endMonth && month > r.endMonth) return false;
  return true;
}

/** Fecha propuesta para el gasto de un recurrente: su día del mes, al mediodía argentino. */
export function recurringDueDate(month: string, dayOfMonth: number): Date {
  const [y, m] = month.split("-").map(Number);
  const day = Math.min(Math.max(1, dayOfMonth), 28);
  return new Date(Date.UTC(y, m - 1, day, 15));
}

/** Categorías con las que arranca el módulo. Se pueden renombrar y archivar. */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Alquiler",
  "Sueldos y cargas sociales",
  "Servicios (luz, agua, internet)",
  "Publicidad y marketing",
  "Impuestos y tasas",
  "Honorarios profesionales",
  "Logística y fletes",
  "Vehículos y combustible",
  "Software y suscripciones",
  "Mantenimiento",
  "Comisiones bancarias",
  "Otros",
];

/** Tope de un comprobante adjunto. Va como base64 a la base, igual que las fotos de reclamos. */
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
