"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, EyeOff } from "@/components/icons";
import { useCurrency } from "@/contexts/currency-context";
import { cn } from "@/lib/utils";
import { periodKeyFor, recentPeriods, type PeriodType } from "@/lib/dashboard-periods";

export type CardMetric =
  | "visits" | "clients" | "salesCount" | "revenue" | "collected" | "pending"
  | "leadsTotal" | "leadsNew" | "leadsContacted";

interface CardResponse {
  value: number;
  sub?: string;
  subAmount?: number;
  currency?: boolean;
}

/** Cuántos períodos hacia atrás ofrece el selector. */
const HISTORY = { week: 26, month: 24 } as const;

/**
 * Card del dashboard con su propio filtro de período: Semana o Mes, y cuál.
 * Cada una pide su valor a /api/dashboard/card por separado, así cambiar el
 * período de una no toca las demás.
 */
export function PeriodStatCard({
  title,
  metric,
  icon: Icon,
  href,
  subPrefix,
  hideMoney,
  onToggleMoney,
}: {
  title: string;
  metric: CardMetric;
  icon: React.ElementType;
  href: string;
  /** Para "pending": texto antes del monto total adeudado. */
  subPrefix?: string;
  hideMoney?: boolean;
  onToggleMoney?: () => void;
}) {
  const { format: formatCurrency } = useCurrency();
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [periodKey, setPeriodKey] = useState(() => periodKeyFor("month"));
  const [data, setData] = useState<CardResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const options = useMemo(() => recentPeriods(periodType, HISTORY[periodType]), [periodType]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    const params = new URLSearchParams({ metric, period: periodType, key: periodKey });
    fetch(`/api/dashboard/card?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: CardResponse) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [metric, periodType, periodKey]);

  function changeType(t: PeriodType) {
    if (t === periodType) return;
    setPeriodType(t);
    setPeriodKey(periodKeyFor(t));
  }

  const isCurrency = data?.currency;
  const value = data ? (isCurrency ? formatCurrency(data.value) : data.value.toLocaleString("es-AR")) : "";
  const sub = data
    ? data.subAmount !== undefined
      ? `${subPrefix ?? "Total"}: ${hideMoney ? "••••" : formatCurrency(data.subAmount)}`
      : data.sub
    : "";

  return (
    <Card className="border transition-all hover:shadow-lg hover:border-primary/30">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 gap-2">
        <Link href={href} className="min-w-0 hover:underline">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
            {title}
          </CardTitle>
        </Link>
        <Link href={href} className="p-2 rounded-lg bg-icon-chip shrink-0" aria-label={title}>
          <Icon className="h-4 w-4 text-primary" />
        </Link>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <div className="min-h-[3rem]">
          {failed ? (
            <p className="text-sm text-muted-foreground">No se pudo cargar</p>
          ) : !data ? (
            <>
              <Skeleton className="h-7 w-20 mb-1" />
              <Skeleton className="h-3 w-24" />
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="font-bold truncate text-lg sm:text-xl lg:text-2xl min-w-0">
                  {isCurrency && hideMoney ? "••••••" : value}
                </p>
                {isCurrency && onToggleMoney && (
                  <button
                    type="button"
                    onClick={onToggleMoney}
                    className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                    aria-label={hideMoney ? "Mostrar montos" : "Ocultar montos"}
                  >
                    {hideMoney
                      ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                )}
              </div>
              {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
            </>
          )}
        </div>

        {/* Filtro de período */}
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-md border border-border bg-muted p-0.5 shrink-0" role="tablist" aria-label="Tipo de período">
            {(["week", "month"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={periodType === t}
                onClick={() => changeType(t)}
                className={cn(
                  "h-6 px-2 text-[11px] rounded font-medium transition-all",
                  periodType === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "week" ? "Sem" : "Mes"}
              </button>
            ))}
          </div>
          <Select value={periodKey} onValueChange={setPeriodKey}>
            <SelectTrigger className="h-7 min-w-0 flex-1 px-2 text-[11px]" aria-label="Período">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.key} value={o.key} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
