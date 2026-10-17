"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/contexts/currency-context";
import { cn } from "@/lib/utils";

type Granularity = "month" | "week" | "day";
type SeriesKey = "ventas" | "cobrado" | "saldo";

/**
 * Colores pedidos: Ventas celeste, Cobrado verde, Saldo rojo. Los tonos están
 * elegidos para que verde y rojo se distingan también con daltonismo (verde
 * oscuro contra rojo claro: difieren en luminosidad, no solo en tono). La
 * identidad nunca va solo por color: cada serie tiene su botón con nombre y el
 * tooltip las nombra.
 */
const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: "ventas", label: "Ventas", color: "#0ea5e9" },
  { key: "cobrado", label: "Monto cobrado", color: "#15803d" },
  { key: "saldo", label: "Saldo pendiente", color: "#f87171" },
];

const SPANS: Record<Granularity, { value: number; label: string }[]> = {
  month: [{ value: 6, label: "Últimos 6 meses" }, { value: 12, label: "Últimos 12 meses" }, { value: 24, label: "Últimos 24 meses" }],
  week: [{ value: 8, label: "Últimas 8 semanas" }, { value: 12, label: "Últimas 12 semanas" }, { value: 26, label: "Últimas 26 semanas" }],
  day: [{ value: 14, label: "Últimos 14 días" }, { value: 30, label: "Últimos 30 días" }, { value: 60, label: "Últimos 60 días" }],
};
const DEFAULT_SPAN: Record<Granularity, number> = { month: 6, week: 12, day: 30 };

interface Point {
  label: string;
  from: string;
  ventas?: number;
  cobrado: number;
  saldo: number;
}

function compactMoney(v: number) {
  if (v === 0) return "";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  return `$${(v / 1000).toFixed(0)}k`;
}

/**
 * Ventas / Monto cobrado / Saldo pendiente por período, en capas: se puede
 * mostrar una serie, varias o las tres. Cobrado y saldo se miden sobre las
 * ventas de cada período (ver /api/dashboard/finance), así ventas = cobrado +
 * saldo en cada grupo. ADMIN no recibe la serie Ventas.
 */
export function FinanceChart({ hideMoney }: { hideMoney?: boolean }) {
  const { format: formatCurrency } = useCurrency();
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [count, setCount] = useState(DEFAULT_SPAN.month);
  const [points, setPoints] = useState<Point[] | null>(null);
  const [includeSales, setIncludeSales] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({ ventas: true, cobrado: true, saldo: true });

  useEffect(() => {
    let cancelled = false;
    setPoints(null);
    setFailed(false);
    fetch(`/api/dashboard/finance?granularity=${granularity}&count=${count}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { points: Point[]; includeSales: boolean }) => {
        if (cancelled) return;
        setPoints(d.points);
        setIncludeSales(d.includeSales);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [granularity, count]);

  const available = SERIES.filter((s) => s.key !== "ventas" || includeSales);
  const shown = available.filter((s) => visible[s.key]);

  function toggle(key: SeriesKey) {
    setVisible((v) => {
      const next = { ...v, [key]: !v[key] };
      // Siempre queda al menos una serie prendida.
      return available.some((s) => next[s.key]) ? next : v;
    });
  }

  function changeGranularity(g: Granularity) {
    setGranularity(g);
    setCount(DEFAULT_SPAN[g]);
  }

  const totals = available.map((s) => ({
    ...s,
    total: (points ?? []).reduce((sum, p) => sum + (p[s.key] ?? 0), 0),
  }));

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base text-card-foreground">
              {includeSales ? "Ventas, cobros y saldo pendiente" : "Cobros y saldo pendiente"}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Sobre las ventas de cada período</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg border border-border bg-muted p-1 w-fit" role="tablist" aria-label="Agrupar por">
              {(["month", "week", "day"] as const).map((g) => (
                <button key={g} role="tab" aria-selected={granularity === g} onClick={() => changeGranularity(g)}
                  className={cn(
                    "h-7 px-3 text-xs rounded-md font-medium transition-all",
                    granularity === g ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}>
                  {g === "month" ? "Mes" : g === "week" ? "Semana" : "Día"}
                </button>
              ))}
            </div>
            <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
              <SelectTrigger className="h-9 w-[170px] text-xs" aria-label="Rango"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SPANS[granularity].map((s) => (
                  <SelectItem key={s.value} value={String(s.value)} className="text-xs">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Leyenda = selector de capas. Cada botón muestra el total del rango. */}
        <div className="flex flex-wrap gap-2" aria-label="Series">
          {totals.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={visible[s.key]}
              onClick={() => toggle(s.key)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-all",
                visible[s.key] ? "border-border bg-background" : "border-dashed border-border bg-transparent opacity-50"
              )}
            >
              <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
              <span className="flex flex-col leading-tight">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <span className="text-sm font-semibold text-foreground">
                  {points ? (hideMoney ? "••••" : formatCurrency(s.total)) : "…"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          {failed ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No se pudo cargar el gráfico</p>
          ) : !points ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 8, right: 8, left: -4, bottom: 0 }} barGap={2} barCategoryGap="22%">
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false}
                  interval="preserveStartEnd" minTickGap={12} />
                <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => (hideMoney ? "" : compactMoney(Number(v)))} />
                <Tooltip
                  cursor={{ fill: "currentColor", fillOpacity: 0.05, radius: 4 }}
                  contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "8px 12px", fontSize: "12px", color: "#f4f4f5" }}
                  labelStyle={{ color: "#a1a1aa", marginBottom: 2 }}
                  itemStyle={{ color: "#f4f4f5" }}
                  formatter={(value, name) => {
                    const serie = SERIES.find((s) => s.key === name);
                    return [hideMoney ? "••••" : formatCurrency(Number(value)), serie?.label ?? String(name)];
                  }}
                />
                {shown.map((s) => (
                  <Bar key={s.key} dataKey={s.key} name={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={36} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
