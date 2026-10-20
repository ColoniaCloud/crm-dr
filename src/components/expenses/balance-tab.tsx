"use client";

import { Fragment, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ChevronDown, ChevronRight, Download } from "@/components/icons";
import { addMonths, monthLabel } from "@/lib/expenses";
import type { BalanceMonth, BalanceResult } from "@/lib/expense-balance";
import { cn } from "@/lib/utils";
import { apiJson, csvNumber, downloadCsv, fmtMoney, isoDateAR } from "./types";

/**
 * Cobros en azul, gastos en naranja. Validado con el script de dataviz para
 * daltonismo en claro y en oscuro (ΔE ≥ 30 en protan/deutan/tritan). No se usa
 * el verde de "Monto cobrado" del dashboard porque verde contra naranja no se
 * distingue con protanopia.
 */
const COLORS = {
  light: { cobros: "#2563eb", gastos: "#ea580c" },
  dark: { cobros: "#3b82f6", gastos: "#ea580c" },
};

type Key = Exclude<keyof BalanceMonth, "month" | "gastosPorCategoria">;

interface Line {
  key: Key;
  label: string;
  sign?: "−" | "=";
  strong?: boolean;
  hint?: string;
}

const ECONOMICO: Line[] = [
  { key: "ventas", label: "Ventas", hint: "Confirmadas o entregadas, por fecha de la venta. Incluye IVA si se facturó." },
  { key: "devoluciones", label: "Devoluciones", sign: "−" },
  { key: "ventasNetas", label: "Ventas netas", sign: "=" },
  { key: "costoVendido", label: "Costo de lo vendido", sign: "−", hint: "Costo landed de la mercadería, al momento de confirmar cada venta." },
  { key: "margenBruto", label: "Margen bruto", sign: "=", strong: true },
  { key: "gastos", label: "Gastos", sign: "−", hint: "Prorrateados por el período que cubre cada uno." },
  { key: "resultadoEconomico", label: "Resultado económico", sign: "=", strong: true },
];

const CAJA: Line[] = [
  { key: "cobros", label: "Cobros", hint: "Pagos recibidos, por fecha de pago." },
  { key: "reintegros", label: "Reintegros en efectivo", sign: "−", hint: "Plata devuelta a clientes por devoluciones." },
  { key: "gastos", label: "Gastos", sign: "−" },
  { key: "resultadoCaja", label: "Resultado de caja", sign: "=", strong: true },
];

const PRESETS = [
  { label: "6 meses", months: 6 },
  { label: "12 meses", months: 12 },
  { label: "Este año", months: 0 },
];

function compact(v: number) {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1000) return `$${(v / 1000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

function money(v: number) {
  return fmtMoney(Math.round(v));
}

export function BalanceTab() {
  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme === "dark" ? COLORS.dark : COLORS.light;
  const currentMonth = isoDateAR(new Date()).slice(0, 7);
  const [from, setFrom] = useState(addMonths(currentMonth, -5));
  const [to, setTo] = useState(currentMonth);
  const [data, setData] = useState<BalanceResult | null>(null);
  const [error, setError] = useState("");
  const [showCategories, setShowCategories] = useState(false);

  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    setData(null);
    setError("");
    apiJson<BalanceResult>(`/api/expenses/balance?from=${from}&to=${to}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo calcular el balance"); });
    return () => { cancelled = true; };
  }, [from, to]);

  function preset(months: number) {
    setTo(currentMonth);
    setFrom(months === 0 ? `${currentMonth.slice(0, 4)}-01` : addMonths(currentMonth, -(months - 1)));
  }

  const t = data?.totals;
  const margenPct = t && t.ventasNetas > 0 ? (t.margenBruto / t.ventasNetas) * 100 : null;
  const usedCategories = data ? data.categories.filter((c) => (t?.gastosPorCategoria[c.id] ?? 0) !== 0) : [];

  function exportCsv() {
    if (!data) return;
    const header = ["Concepto", ...data.months.map((m) => monthLabel(m.month, true)), "Total"];
    const row = (label: string, key: Key) => [label, ...data.months.map((m) => csvNumber(m[key])), csvNumber(data.totals[key])];
    downloadCsv(`balance_${data.from}_${data.to}.csv`, [
      header,
      ["ECONÓMICO"],
      ...ECONOMICO.map((l) => row(l.label, l.key)),
      [],
      ["CAJA"],
      ...CAJA.map((l) => row(l.label, l.key)),
      [],
      ["GASTOS POR CATEGORÍA"],
      ...usedCategories.map((c) => [
        c.name,
        ...data.months.map((m) => csvNumber(m.gastosPorCategoria[c.id] ?? 0)),
        csvNumber(data.totals.gastosPorCategoria[c.id] ?? 0),
      ]),
    ]);
  }

  const chartData = data?.months.map((m) => ({ label: monthLabel(m.month, true), cobros: m.cobros, gastos: m.gastos })) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div className="grid grid-cols-2 gap-3 md:w-80">
          <div className="space-y-1">
            <Label htmlFor="b-from" className="text-xs">Desde</Label>
            <Input id="b-from" type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="b-to" className="text-xs">Hasta</Label>
            <Input id="b-to" type="month" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.label} variant="outline" size="sm" onClick={() => preset(p.months)}>{p.label}</Button>
          ))}
        </div>
        <Button variant="outline" className="md:ml-auto" onClick={exportCsv} disabled={!data}>
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {/* Titulares */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Margen bruto", value: t?.margenBruto, sub: margenPct !== null ? `${margenPct.toFixed(1)}% de las ventas netas` : "Sin ventas en el rango" },
          { label: "Resultado económico", value: t?.resultadoEconomico, sub: "Margen bruto − gastos" },
          { label: "Cobros", value: t?.cobros, sub: "Lo que entró en el rango" },
          { label: "Resultado de caja", value: t?.resultadoCaja, sub: "Cobros − reintegros − gastos" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              {k.value === undefined ? (
                <Skeleton className="h-8 w-28 mt-1" />
              ) : (
                <p className={cn("text-xl sm:text-2xl font-bold tabular-nums", k.value < 0 && "text-destructive")}>{money(k.value)}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data && (data.estimatedCostLines > 0 || data.missingCostLines > 0) && (
        <div className="flex gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            {data.estimatedCostLines > 0 && (
              <>
                {data.estimatedCostLines} {data.estimatedCostLines === 1 ? "línea de venta se confirmó" : "líneas de venta se confirmaron"} antes de que el CRM guardara el costo de cada venta: se costean con el costo promedio de hoy, así que el margen de esos meses es una estimación.{" "}
              </>
            )}
            {data.missingCostLines > 0 && (
              <>
                {data.missingCostLines} {data.missingCostLines === 1 ? "línea no tiene" : "líneas no tienen"} ningún costo cargado en el producto y cuentan como costo cero: el margen está inflado por eso.
              </>
            )}
          </p>
        </div>
      )}

      {/* Gráfico */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cobros y gastos por mes</CardTitle>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Leyenda">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: colors.cobros }} />Cobros</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: colors.gastos }} />Gastos (prorrateados)</span>
          </div>
        </CardHeader>
        <CardContent>
          {!data ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={2} barCategoryGap="25%">
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={compact} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" }}
                    formatter={(v, name) => [money(Number(v)), name === "cobros" ? "Cobros" : "Gastos"]}
                  />
                  <Bar dataKey="cobros" fill={colors.cobros} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="gastos" fill={colors.gastos} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabla */}
      {data && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 z-10 bg-card text-left font-medium text-muted-foreground px-3 py-2 min-w-[200px]">Concepto</th>
                    {data.months.map((m) => (
                      <th key={m.month} className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">{monthLabel(m.month, true)}</th>
                    ))}
                    <th className="text-right font-semibold px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      { title: "Económico — ¿gana plata lo que vendemos?", lines: ECONOMICO },
                      { title: "Caja — ¿cuánta plata entró?", lines: CAJA },
                    ] as const
                  ).map((block) => (
                    <Fragment key={block.title}>
                      <tr className="bg-muted/50">
                        <td colSpan={data.months.length + 2} className="sticky left-0 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {block.title}
                        </td>
                      </tr>
                      {block.lines.map((l) => (
                        <tr key={`${block.title}-${l.key}`} className={cn("border-b border-border/60", l.strong && "font-semibold")}>
                          <td className="sticky left-0 z-10 bg-card px-3 py-2" title={l.hint}>
                            <span className="inline-block w-4 text-muted-foreground">{l.sign ?? ""}</span>
                            {l.label}
                          </td>
                          {data.months.map((m) => (
                            <td key={m.month} className={cn("text-right tabular-nums px-3 py-2 whitespace-nowrap", l.strong && m[l.key] < 0 && "text-destructive")}>
                              {m[l.key] === 0 ? <span className="text-muted-foreground">—</span> : money(m[l.key])}
                            </td>
                          ))}
                          <td className={cn("text-right tabular-nums px-3 py-2 whitespace-nowrap font-semibold", l.strong && data.totals[l.key] < 0 && "text-destructive")}>
                            {money(data.totals[l.key])}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}

                  <tr className="bg-muted/50">
                    <td colSpan={data.months.length + 2} className="sticky left-0 px-3 py-1">
                      <button
                        type="button"
                        className="flex items-center gap-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                        aria-expanded={showCategories}
                        onClick={() => setShowCategories((v) => !v)}
                      >
                        {showCategories ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        Gastos por categoría
                      </button>
                    </td>
                  </tr>
                  {showCategories &&
                    (usedCategories.length === 0 ? (
                      <tr><td colSpan={data.months.length + 2} className="px-3 py-3 text-muted-foreground">Sin gastos en el rango</td></tr>
                    ) : (
                      usedCategories.map((c) => (
                        <tr key={c.id} className="border-b border-border/60">
                          <td className="sticky left-0 z-10 bg-card px-3 py-2 pl-7">{c.name}</td>
                          {data.months.map((m) => {
                            const v = m.gastosPorCategoria[c.id] ?? 0;
                            return (
                              <td key={m.month} className="text-right tabular-nums px-3 py-2 whitespace-nowrap">
                                {v === 0 ? <span className="text-muted-foreground">—</span> : money(v)}
                              </td>
                            );
                          })}
                          <td className="text-right tabular-nums px-3 py-2 whitespace-nowrap font-semibold">{money(data.totals.gastosPorCategoria[c.id] ?? 0)}</td>
                        </tr>
                      ))
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Dos bloques a propósito: el costo de la mercadería se compara contra las ventas, no contra los cobros — si no, un mes con mucha venta a cuenta corriente daría pérdida aunque haya ganado. Los montos en dólares se pasan a pesos con la cotización con que se cargó cada movimiento.
      </p>
    </div>
  );
}
