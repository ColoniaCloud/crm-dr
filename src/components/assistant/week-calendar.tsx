"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgendaItem, AgendaKind } from "@/types/assistant-panel";

const AR_TZ = "America/Argentina/Buenos_Aires";
/** Franja horaria que se dibuja. Lo que cae fuera se pega al borde. */
const START_HOUR = 7;
const END_HOUR = 21;
const HOUR_PX = 40;
/** Duración visual de un evento con hora (no guardamos fin). */
const EVENT_MIN = 45;

const KIND: Record<AgendaKind, { label: string; chip: string; dot: string }> = {
  call:        { label: "Llamadas",     chip: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/60 dark:text-sky-100 dark:border-sky-800",                 dot: "bg-sky-500" },
  visit:       { label: "Visitas",      chip: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-100 dark:border-emerald-800", dot: "bg-emerald-500" },
  task:        { label: "Tareas",       chip: "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-950/60 dark:text-violet-100 dark:border-violet-800",   dot: "bg-violet-500" },
  quote:       { label: "Presupuestos", chip: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-100 dark:border-amber-800",       dot: "bg-amber-500" },
  purchase:    { label: "Compras",      chip: "bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-800/60 dark:text-slate-100 dark:border-slate-600",       dot: "bg-slate-500" },
  installment: { label: "Cuotas",       chip: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-100 dark:border-rose-800",             dot: "bg-rose-500" },
};

/** Fecha "de pared" en Argentina (año, mes, día, hora, minuto) de un instante. */
function arParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: AR_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

const dayKey = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Lunes de la semana (en Argentina) que contiene `ref`, corrido `offset` semanas. */
function weekDays(offset: number) {
  const now = arParts(new Date());
  // Se trabaja en UTC con la fecha de pared argentina para no depender del huso del navegador.
  const base = new Date(Date.UTC(now.y, now.m - 1, now.d));
  const dow = (base.getUTCDay() + 6) % 7; // 0 = lunes
  base.setUTCDate(base.getUTCDate() - dow + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: i, key: dayKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) };
  });
}

/** Medianoche argentina (UTC-3, sin horario de verano) de un día, como instante. */
const arMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 3));

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type Scope = "mine" | "team";

export function WeekCalendar({
  isAdmin,
  refreshKey,
  className,
}: {
  isAdmin: boolean;
  refreshKey: number;
  className?: string;
}) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [scope, setScope] = useState<Scope>("mine");
  const [items, setItems] = useState<AgendaItem[] | null>(null);
  const [error, setError] = useState(false);
  const [nowParts, setNowParts] = useState(() => arParts(new Date()));
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => weekDays(offset), [offset]);
  const todayKey = dayKey(nowParts.y, nowParts.m, nowParts.d);

  const load = useCallback(async () => {
    const first = days[0];
    const last = days[6];
    const from = arMidnight(first.y, first.m, first.d);
    const to = arMidnight(last.y, last.m, last.d + 1);
    try {
      const res = await fetch(
        `/api/assistant/agenda?from=${from.toISOString()}&to=${to.toISOString()}${scope === "team" ? "&scope=team" : ""}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: AgendaItem[] };
      setItems(data.items);
      setError(false);
    } catch {
      setError(true);
      setItems((prev) => prev ?? []);
    }
  }, [days, scope]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Línea de "ahora" y recarga suave cada 5 minutos.
  useEffect(() => {
    const id = setInterval(() => {
      setNowParts(arParts(new Date()));
      if (document.visibilityState === "visible") load();
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Al abrir, la grilla arranca cerca de la hora actual.
  useEffect(() => {
    if (!scrollRef.current) return;
    const h = Math.min(Math.max(nowParts.h - 1, START_HOUR), END_HOUR - 4);
    scrollRef.current.scrollTop = (h - START_HOUR) * HOUR_PX;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, { allDay: AgendaItem[]; timed: (AgendaItem & { top: number; col: number; cols: number })[] }>();
    for (const day of days) map.set(day.key, { allDay: [], timed: [] });
    for (const it of items ?? []) {
      const p = arParts(new Date(it.at));
      const bucket = map.get(dayKey(p.y, p.m, p.d));
      if (!bucket) continue;
      if (it.allDay) {
        bucket.allDay.push(it);
      } else {
        const minutes = Math.min(Math.max((p.h - START_HOUR) * 60 + p.min, 0), (END_HOUR - START_HOUR) * 60 - EVENT_MIN);
        bucket.timed.push({ ...it, top: (minutes / 60) * HOUR_PX, col: 0, cols: 1 });
      }
    }
    // Eventos que se pisan se reparten el ancho del día.
    for (const bucket of map.values()) {
      const ev = bucket.timed.sort((a, b) => a.top - b.top);
      const height = (EVENT_MIN / 60) * HOUR_PX;
      let group: typeof ev = [];
      let groupEnd = -1;
      const flush = () => {
        const colsEnd: number[] = [];
        for (const e of group) {
          let c = colsEnd.findIndex((end) => end <= e.top);
          if (c === -1) { c = colsEnd.length; colsEnd.push(0); }
          colsEnd[c] = e.top + height;
          e.col = c;
        }
        for (const e of group) e.cols = colsEnd.length;
        group = [];
      };
      for (const e of ev) {
        if (group.length && e.top >= groupEnd) flush();
        group.push(e);
        groupEnd = Math.max(groupEnd, e.top + height);
      }
      flush();
    }
    return map;
  }, [items, days]);

  const hasAllDay = [...byDay.values()].some((b) => b.allDay.length > 0);
  const presentKinds = useMemo(() => [...new Set((items ?? []).map((i) => i.kind))], [items]);

  const first = days[0];
  const last = days[6];
  const rangeLabel =
    first.m === last.m
      ? `${first.d}–${last.d} ${MONTHS[first.m - 1]} ${last.y}`
      : `${first.d} ${MONTHS[first.m - 1]} – ${last.d} ${MONTHS[last.m - 1]} ${last.y}`;

  function open(it: AgendaItem) {
    if (it.link) router.push(it.link);
  }

  function chip(it: AgendaItem, compact: boolean) {
    const k = KIND[it.kind];
    const time = it.allDay
      ? ""
      : new Date(it.at).toLocaleTimeString("es-AR", { timeZone: AR_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const tooltip = [time, it.title, it.detail, it.owner ? `· ${it.owner}` : ""].filter(Boolean).join(" ");
    return (
      <button
        type="button"
        onClick={() => open(it)}
        title={tooltip}
        className={cn(
          "w-full overflow-hidden rounded border px-1 text-left text-[10px] leading-tight transition-opacity hover:opacity-80",
          k.chip,
          it.done && "line-through opacity-50",
          !it.link && "cursor-default",
          compact ? "truncate py-0.5" : "h-full py-0.5",
        )}
      >
        {!compact && time && <span className="block font-semibold tabular-nums">{time}</span>}
        <span className={cn(compact ? "" : "line-clamp-2")}>{it.title}</span>
      </button>
    );
  }

  const gridHeight = (END_HOUR - START_HOUR) * HOUR_PX;
  const nowTop =
    nowParts.h >= START_HOUR && nowParts.h < END_HOUR ? ((nowParts.h - START_HOUR) * 60 + nowParts.min) / 60 * HOUR_PX : null;

  return (
    <section className={cn("flex min-h-0 flex-col rounded-xl border bg-card", className)} aria-label="Calendario semanal">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Calendario</h2>
        <div className="flex items-center">
          <button type="button" onClick={() => setOffset((o) => o - 1)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[7.5rem] text-center text-xs font-medium tabular-nums">{rangeLabel}</span>
          <button type="button" onClick={() => setOffset((o) => o + 1)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Semana siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {offset !== 0 && (
          <button type="button" onClick={() => setOffset(0)} className="rounded-md border px-2 py-0.5 text-[11px] hover:bg-muted">
            Hoy
          </button>
        )}
        {isAdmin && (
          <div className="ml-auto flex rounded-md bg-muted p-0.5 text-xs" role="tablist">
            {(["mine", "team"] as Scope[]).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={scope === s}
                onClick={() => setScope(s)}
                className={cn(
                  "rounded px-2 py-0.5 transition-colors",
                  scope === s ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "mine" ? "Mío" : "Equipo"}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Encabezado de días + fila de vencimientos sin hora */}
      <div className="shrink-0 border-b">
        <div className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))]">
          <div />
          {days.map((d) => (
            <div key={d.key} className="border-l px-0.5 py-1 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">{DOW[d.dow]}</div>
              <div
                className={cn(
                  "mx-auto flex h-5 w-5 items-center justify-center rounded-full text-xs tabular-nums",
                  d.key === todayKey && "bg-primary font-semibold text-primary-foreground",
                )}
              >
                {d.d}
              </div>
            </div>
          ))}
        </div>
        {hasAllDay && (
          <div className="grid max-h-20 grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] overflow-y-auto border-t">
            <div className="px-0.5 py-1 text-right text-[9px] leading-tight text-muted-foreground">Vence</div>
            {days.map((d) => (
              <div key={d.key} className="space-y-0.5 border-l p-0.5">
                {byDay.get(d.key)!.allDay.map((it) => <div key={it.id}>{chip(it, true)}</div>)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grilla horaria */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))]" style={{ height: gridHeight }}>
          <div className="relative">
            {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
              <span
                key={i}
                className="absolute right-1 -translate-y-1/2 text-[9px] tabular-nums text-muted-foreground"
                style={{ top: i * HOUR_PX }}
              >
                {i === 0 ? "" : `${START_HOUR + i}`}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const bucket = byDay.get(d.key)!;
            return (
              <div key={d.key} className={cn("relative border-l", d.key === todayKey && "bg-primary/[0.03]")}>
                {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                  <div key={i} className="absolute inset-x-0 border-t border-border/60" style={{ top: i * HOUR_PX }} />
                ))}
                {d.key === todayKey && nowTop !== null && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowTop }}>
                    <span className="-ml-1 h-2 w-2 rounded-full bg-red-500" />
                    <span className="h-px flex-1 bg-red-500" />
                  </div>
                )}
                {bucket.timed.map((it) => (
                  <div
                    key={it.id}
                    className="absolute z-[5] px-px"
                    style={{
                      top: it.top,
                      height: (EVENT_MIN / 60) * HOUR_PX,
                      left: `${(it.col / it.cols) * 100}%`,
                      width: `${100 / it.cols}%`,
                    }}
                  >
                    {chip(it, false)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-1.5">
        {(presentKinds.length ? presentKinds : (["call", "visit", "task"] as AgendaKind[])).map((k) => (
          <span key={k} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 rounded-full", KIND[k].dot)} />
            {KIND[k].label}
          </span>
        ))}
        {items !== null && items.length === 0 && !error && (
          <span className="ml-auto text-[10px] text-muted-foreground">Nada agendado esta semana</span>
        )}
        {error && <span className="ml-auto text-[10px] text-destructive">No se pudo cargar la agenda</span>}
      </footer>
    </section>
  );
}
