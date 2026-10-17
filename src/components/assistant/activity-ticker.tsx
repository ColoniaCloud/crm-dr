"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Sparkles, ShoppingCart, UserPlus, ShieldCheck, Boxes, RefreshCw } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { FeedCategory, FeedEvent } from "@/types/assistant-panel";

/**
 * Tips de cómo hablarle al asistente. Cada uno es algo que el asistente ya
 * sabe hacer (ver las herramientas de `src/lib/assistant-core.ts`): si se agrega
 * una herramienta, vale la pena sumar su tip acá.
 */
const TIPS: string[] = [
  "Recordame llamar a Juan Pérez el jueves a las 10",
  "¿Cuánto vendimos este mes?",
  "¿Quién nos debe plata?",
  "Agendame una visita a Polarizados Norte mañana a las 15",
  "Sumame el stock de todos los productos",
  "¿Cuánto cobramos la semana pasada?",
  "Mostrame los leads que todavía no contactamos",
  "Convertí el lead de Taller Sur en cliente",
  "Buscá el rollo de garantía LOT-0001-R001",
  "Anotá una tarea: revisar los presupuestos vencidos el viernes",
  "Exportame la actividad de operadores del mes pasado",
  "Registrá un pago de $50.000 en efectivo a la venta #120",
];

/** Cada cuántas noticias se intercala un tip. */
const TIP_EVERY = 4;
const POLL_MS = 45_000;

const CATEGORY: Record<FeedCategory, { icon: typeof Activity; label: string; dot: string }> = {
  sales:    { icon: ShoppingCart, label: "Ventas",    dot: "bg-emerald-500" },
  leads:    { icon: UserPlus,     label: "Contactos", dot: "bg-sky-500" },
  warranty: { icon: ShieldCheck,  label: "Garantías", dot: "bg-violet-500" },
  stock:    { icon: Boxes,        label: "Stock",     dot: "bg-amber-500" },
};

type Row =
  | { kind: "event"; key: string; event: FeedEvent }
  | { kind: "tip"; key: string; text: string };

function relativeTime(iso: string, now: number): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export function ActivityTicker({ onAsk, className }: { onAsk: (text: string) => void; className?: string }) {
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [paused, setPaused] = useState(false);
  const knownIds = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/assistant/feed", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { events: FeedEvent[] };
      // Lo que no estaba en la carga anterior se marca como nuevo un rato.
      if (knownIds.current) {
        const added = data.events.filter((e) => !knownIds.current!.has(e.id)).map((e) => e.id);
        if (added.length) {
          setFresh(new Set(added));
          setTimeout(() => setFresh(new Set()), 8_000);
        }
      }
      knownIds.current = new Set(data.events.map((e) => e.id));
      setEvents(data.events);
      setError(false);
      setNow(Date.now());
    } catch {
      setError(true);
      setEvents((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    // Los tips arrancan en un lugar que depende de la última noticia, así van
    // rotando a medida que entra actividad en vez de repetir siempre los primeros.
    const seed = events?.[0]?.id ?? "";
    let tipIndex = [...seed].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9973, 0);
    (events ?? []).forEach((event, i) => {
      out.push({ kind: "event", key: event.id, event });
      if ((i + 1) % TIP_EVERY === 0) {
        out.push({ kind: "tip", key: `tip-${i}`, text: TIPS[tipIndex % TIPS.length] });
        tipIndex++;
      }
    });
    // Sin noticias (o con pocas) igual se muestran tips: es lo que enseña a usarlo.
    while (out.length < 3) {
      out.push({ kind: "tip", key: `tip-fill-${out.length}`, text: TIPS[tipIndex % TIPS.length] });
      tipIndex++;
    }
    return out;
  }, [events]);

  // El desplazamiento es una animación CSS sobre la lista duplicada: al llegar
  // a la mitad vuelve a cero y no se nota el salto. Solo se anima si sobra contenido.
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const check = () => {
      if (!viewportRef.current || !listRef.current) return;
      setScrolls(listRef.current.scrollHeight > viewportRef.current.clientHeight + 4);
    };
    check();
    const ro = new ResizeObserver(check);
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [rows]);

  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const animate = scrolls && !prefersReducedMotion;
  const duration = Math.max(20, rows.length * 3.5);

  function renderRow(row: Row, dup: boolean) {
    if (row.kind === "tip") {
      return (
        <button
          key={`${row.key}${dup ? "-d" : ""}`}
          type="button"
          tabIndex={dup ? -1 : 0}
          aria-hidden={dup || undefined}
          onClick={() => onAsk(row.text)}
          className="group flex w-full items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-left transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0 text-xs leading-snug">
            <span className="font-semibold text-primary">Probá decirle: </span>
            <span className="text-foreground">“{row.text}”</span>
          </span>
        </button>
      );
    }
    const e = row.event;
    const cat = CATEGORY[e.category];
    const Icon = cat.icon;
    return (
      <button
        key={`${row.key}${dup ? "-d" : ""}`}
        type="button"
        tabIndex={dup ? -1 : 0}
        aria-hidden={dup || undefined}
        onClick={() => onAsk(e.ask)}
        title="Preguntarle al asistente por esto"
        className={cn(
          "group flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          fresh.has(e.id) && !dup && "bg-muted",
        )}
      >
        <span className="relative mt-0.5 shrink-0">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={cn("absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full", cat.dot)} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "truncate text-xs font-medium",
                e.tone === "warning" && "text-amber-700 dark:text-amber-400",
                e.tone === "success" && "text-emerald-700 dark:text-emerald-400",
              )}
            >
              {e.title}
            </span>
            <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">{relativeTime(e.at, now)}</span>
          </span>
          {e.detail && <span className="block truncate text-[11px] text-muted-foreground">{e.detail}</span>}
        </span>
      </button>
    );
  }

  return (
    <section className={cn("flex min-h-0 flex-col rounded-xl border bg-card", className)} aria-label="Actividad del CRM">
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <span className="relative flex h-2 w-2">
          <span className={cn("absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60", !error && "animate-ping")} />
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", error ? "bg-muted-foreground" : "bg-emerald-500")} />
        </span>
        <h2 className="text-sm font-semibold">Actividad</h2>
        <div className="ml-2 hidden items-center gap-2.5 xl:flex">
          {Object.values(CATEGORY).map((c) => (
            <span key={c.label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
              {c.label}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={load}
          className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Actualizar"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </header>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        {events === null ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <div
            className={cn(animate && "ticker-scroll")}
            style={animate ? { animationDuration: `${duration}s`, animationPlayState: paused ? "paused" : "running" } : undefined}
          >
            <div ref={listRef} className="space-y-1 px-2 pt-1.5">
              {rows.map((r) => renderRow(r, false))}
            </div>
            {animate && <div className="space-y-1 px-2 pt-1.5">{rows.map((r) => renderRow(r, true))}</div>}
          </div>
        )}
        {/* Desvanecido arriba y abajo para que el corte no se vea seco. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-card to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-card to-transparent" />
      </div>
      {error && (
        <p className="shrink-0 border-t px-3 py-1 text-[11px] text-muted-foreground">No se pudo actualizar la actividad. Reintentando…</p>
      )}
    </section>
  );
}
