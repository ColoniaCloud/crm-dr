import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { computeBalance } from "@/lib/expense-balance";
import { addMonths, isMonthKey, monthKeyOf, monthSpan } from "@/lib/expenses";

const log = createLogger("api/expenses/balance");

const MAX_MONTHS = 24;

/**
 * Balance ingresos vs. egresos, mes por mes. Ver src/lib/expense-balance.ts
 * para los criterios de cada número.
 *
 *   GET /api/expenses/balance?from=2026-01&to=2026-10   (default: últimos 6 meses)
 */
export async function GET(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  const { searchParams } = new URL(request.url);
  const current = monthKeyOf(new Date());
  const toParam = searchParams.get("to");
  const fromParam = searchParams.get("from");
  const to = isMonthKey(toParam) ? toParam : current;
  const from = isMonthKey(fromParam) ? fromParam : addMonths(to, -5);

  const span = monthSpan(from, to);
  if (span === 0) return NextResponse.json({ error: "El rango termina antes de empezar" }, { status: 400 });
  if (span > MAX_MONTHS) {
    return NextResponse.json({ error: `El balance abarca hasta ${MAX_MONTHS} meses` }, { status: 400 });
  }

  try {
    return NextResponse.json(await computeBalance(from, to));
  } catch (error) {
    log.error({ err: error }, "Error computing balance");
    return NextResponse.json({ error: "No se pudo calcular el balance" }, { status: 500 });
  }
}
