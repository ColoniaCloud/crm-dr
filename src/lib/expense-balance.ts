/**
 * Balance de Control de gastos: ingresos contra egresos, mes por mes.
 *
 * Son DOS bloques a propósito, porque mezclarlos da números que mienten:
 *
 * 1. **Económico** — ventas del mes − costo de lo vendido = margen bruto;
 *    margen bruto − gastos = resultado económico. Mide si el negocio gana plata
 *    con lo que vende, se haya cobrado o no.
 * 2. **Caja** — cobros del mes − reintegros en efectivo − gastos = resultado de
 *    caja. Mide cuánta plata entró de verdad.
 *
 * Si se restara el costo de lo vendido a los cobros, un mes con mucha venta a
 * cuenta corriente daría pérdida aunque haya ganado. Por eso el costo de la
 * mercadería solo vive en el bloque 1, y en los dos bloques los gastos son los
 * mismos: prorrateados por período (src/lib/expenses.ts).
 *
 * Criterios, para que el número se pueda auditar contra el resto del CRM:
 * - Ventas: CONFIRMED o DELIVERED (las que movieron mercadería), por fecha de
 *   creación, por `Sale.total` (ya incluye IVA si se facturó y el descuento).
 *   Las devoluciones del mes se restan a las ventas, y su costo al costo.
 * - Costo de lo vendido: `SaleItemCost.unitCost` (foto al confirmar). Las ventas
 *   anteriores a esa columna caen a `Product.cost` de hoy y se cuentan aparte
 *   como "estimadas" para que la pantalla avise.
 * - Cobros: `Payment.amount` por `paidAt` — el mismo criterio que la card de
 *   Cobros del dashboard.
 * - Reintegros: `AccountAdjustment` de tipo REFUND (efectivo devuelto por una
 *   devolución), por `effectiveAt`.
 */
import { prisma } from "@/lib/prisma";
import { periodRange } from "@/lib/dashboard-periods";
import { expenseMonthlyShares, monthKeyOf, monthRange, round2, toARS } from "@/lib/expenses";

export interface BalanceMonth {
  month: string;
  ventas: number;
  devoluciones: number;
  ventasNetas: number;
  costoVendido: number;
  margenBruto: number;
  cobros: number;
  reintegros: number;
  gastos: number;
  gastosPorCategoria: Record<string, number>;
  resultadoEconomico: number;
  resultadoCaja: number;
}

export interface BalanceResult {
  from: string;
  to: string;
  months: BalanceMonth[];
  totals: Omit<BalanceMonth, "month">;
  categories: { id: string; name: string }[];
  /** Líneas de venta costeadas con el costo actual porque no tenían foto del costo. */
  estimatedCostLines: number;
  /** Líneas de venta sin ningún costo conocido (ni foto ni Product.cost): costean 0. */
  missingCostLines: number;
}

function emptyMonth(month: string): BalanceMonth {
  return {
    month,
    ventas: 0,
    devoluciones: 0,
    ventasNetas: 0,
    costoVendido: 0,
    margenBruto: 0,
    cobros: 0,
    reintegros: 0,
    gastos: 0,
    gastosPorCategoria: {},
    resultadoEconomico: 0,
    resultadoCaja: 0,
  };
}

export async function computeBalance(from: string, to: string): Promise<BalanceResult> {
  const months = monthRange(from, to);
  const start = periodRange("month", from)!.from;
  const end = periodRange("month", to)!.to;
  const byMonth = new Map(months.map((m) => [m, emptyMonth(m)]));
  const inRange = (m: string) => byMonth.get(m);

  let estimatedCostLines = 0;
  let missingCostLines = 0;
  const lineCost = (unitCost: unknown, productCost: unknown, quantity: number) => {
    if (unitCost != null) return Number(unitCost) * quantity;
    if (productCost != null) {
      estimatedCostLines++;
      return Number(productCost) * quantity;
    }
    missingCostLines++;
    return 0;
  };

  const [sales, returns, payments, refunds, expenses, categories] = await Promise.all([
    prisma.sale.findMany({
      where: { status: { in: ["CONFIRMED", "DELIVERED"] }, createdAt: { gte: start, lt: end } },
      select: {
        total: true,
        currency: true,
        exchangeRate: true,
        createdAt: true,
        items: {
          select: { quantity: true, costSnapshot: { select: { unitCost: true } }, product: { select: { cost: true } } },
        },
      },
    }),
    prisma.saleReturn.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: {
        total: true,
        currency: true,
        createdAt: true,
        sale: { select: { exchangeRate: true } },
        items: {
          select: {
            quantity: true,
            saleItem: { select: { costSnapshot: { select: { unitCost: true } } } },
            product: { select: { cost: true } },
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: { paidAt: { gte: start, lt: end } },
      select: { amount: true, currency: true, exchangeRate: true, paidAt: true },
    }),
    prisma.accountAdjustment.findMany({
      where: { type: "REFUND", effectiveAt: { gte: start, lt: end } },
      select: { amount: true, effectiveAt: true },
    }),
    // Pagados en el rango sin período, o con un período que se cruza con el
    // rango (aunque se hayan pagado antes: el seguro anual de enero pesa en
    // octubre). Los meses "YYYY-MM" se comparan bien como texto.
    prisma.expense.findMany({
      where: {
        OR: [
          { periodStart: null, paidAt: { gte: start, lt: end } },
          { periodStart: { lte: to }, periodEnd: { gte: from } },
        ],
      },
      select: { amountARS: true, paidAt: true, periodStart: true, periodEnd: true, categoryId: true },
    }),
    prisma.expenseCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);

  for (const s of sales) {
    const row = inRange(monthKeyOf(s.createdAt));
    if (!row) continue;
    row.ventas += toARS(Number(s.total), s.currency, s.exchangeRate ? Number(s.exchangeRate) : null);
    for (const it of s.items) row.costoVendido += lineCost(it.costSnapshot?.unitCost, it.product.cost, it.quantity);
  }

  for (const r of returns) {
    const row = inRange(monthKeyOf(r.createdAt));
    if (!row) continue;
    row.devoluciones += toARS(Number(r.total), r.currency, r.sale.exchangeRate ? Number(r.sale.exchangeRate) : null);
    for (const it of r.items) row.costoVendido -= lineCost(it.saleItem.costSnapshot?.unitCost, it.product.cost, it.quantity);
  }

  for (const p of payments) {
    const row = inRange(monthKeyOf(p.paidAt));
    if (row) row.cobros += toARS(Number(p.amount), p.currency, p.exchangeRate ? Number(p.exchangeRate) : null);
  }

  for (const a of refunds) {
    const row = inRange(monthKeyOf(a.effectiveAt));
    // REFUND va con signo positivo (aumenta la deuda del cliente, porque compensa
    // la nota de crédito): para la caja es plata que salió.
    if (row) row.reintegros += Math.abs(Number(a.amount));
  }

  for (const e of expenses) {
    for (const share of expenseMonthlyShares({
      amountARS: Number(e.amountARS),
      paidAt: e.paidAt,
      periodStart: e.periodStart,
      periodEnd: e.periodEnd,
    })) {
      const row = inRange(share.month);
      if (!row) continue;
      row.gastos += share.amount;
      row.gastosPorCategoria[e.categoryId] = (row.gastosPorCategoria[e.categoryId] ?? 0) + share.amount;
    }
  }

  const totals = emptyMonth("total");
  const result = months.map((m) => {
    const row = byMonth.get(m)!;
    row.ventasNetas = row.ventas - row.devoluciones;
    row.margenBruto = row.ventasNetas - row.costoVendido;
    row.resultadoEconomico = row.margenBruto - row.gastos;
    row.resultadoCaja = row.cobros - row.reintegros - row.gastos;

    for (const k of [
      "ventas", "devoluciones", "ventasNetas", "costoVendido", "margenBruto",
      "cobros", "reintegros", "gastos", "resultadoEconomico", "resultadoCaja",
    ] as const) {
      totals[k] += row[k];
      row[k] = round2(row[k]);
    }
    for (const [cat, v] of Object.entries(row.gastosPorCategoria)) {
      totals.gastosPorCategoria[cat] = (totals.gastosPorCategoria[cat] ?? 0) + v;
      row.gastosPorCategoria[cat] = round2(v);
    }
    return row;
  });

  for (const k of Object.keys(totals) as (keyof BalanceMonth)[]) {
    if (typeof totals[k] === "number") (totals[k] as number) = round2(totals[k] as number);
  }
  for (const cat of Object.keys(totals.gastosPorCategoria)) {
    totals.gastosPorCategoria[cat] = round2(totals.gastosPorCategoria[cat]);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { month: _m, ...totalsWithoutMonth } = totals;

  return {
    from,
    to,
    months: result,
    totals: totalsWithoutMonth,
    categories,
    estimatedCostLines,
    missingCostLines,
  };
}
