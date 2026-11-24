"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Filter, Search, X } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Piezas de los filtros de las listas (Leads, Clientes): el panel lateral, los
 * chips de lo que está aplicado y los controles de adentro. Las dos pantallas
 * filtran igual para que lo aprendido en una sirva en la otra.
 *
 * Convención: "filtro" es lo que recorta la lista. El orden y "Todos | Míos" no
 * son filtros —se ven siempre en la barra— y no suman al contador ni a los chips.
 */

export type ActiveFilterChip = {
  key: string;
  /** Qué filtra ("Provincia"). */
  label: string;
  /** El valor elegido ("Córdoba"). */
  value: string;
  onRemove: () => void;
};

/** Lo aplicado, a la vista y quitable de a uno. Se ajusta a varias líneas: nunca se corta. */
export function ActiveFilterChips({
  chips,
  onClearAll,
  className,
}: {
  chips: ActiveFilterChip[];
  onClearAll: () => void;
  className?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} aria-label="Filtros aplicados">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs text-foreground"
        >
          <span className="text-muted-foreground">{c.label}:</span>
          <span className="truncate font-medium">{c.value}</span>
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={`Quitar filtro ${c.label}: ${c.value}`}
            className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="rounded px-1.5 py-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Limpiar todo
        </button>
      )}
    </div>
  );
}

/**
 * El panel de filtros. El pie siempre está: "Ver N resultados" cierra el panel
 * (los filtros ya se aplicaron al tocarlos) y "Limpiar" aparece si hay algo.
 */
export function FilterSheet({
  open,
  onOpenChange,
  activeCount,
  resultCount,
  resultNoun,
  onClear,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCount: number;
  resultCount: number | null;
  /** "leads", "clientes". */
  resultNoun: string;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="shrink-0 border-b px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Filter size={15} /> Filtros
            {activeCount > 0 && (
              <span className="ml-auto mr-6 text-xs font-normal text-muted-foreground">
                {activeCount} aplicado{activeCount > 1 ? "s" : ""}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">{children}</div>

        <div className="flex shrink-0 gap-2 border-t px-5 py-4">
          {activeCount > 0 && (
            <Button variant="outline" className="h-10" onClick={onClear}>
              Limpiar
            </Button>
          )}
          <Button className="h-10 flex-1" onClick={() => onOpenChange(false)}>
            {resultCount === null ? "Ver resultados" : `Ver ${resultCount.toLocaleString("es-AR")} ${resultNoun}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Un bloque del panel, con su título y, si tiene algo elegido, "Quitar". */
export function FilterSection({
  title,
  onClear,
  children,
}: {
  title: string;
  /** Si viene, hay algo elegido en esta sección. */
  onClear?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={11} /> Quitar
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Opciones que se excluyen entre sí, todas a la vista (2 a 4). Es un grupo de
 * radios para el lector de pantalla: siempre hay una elegida.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  size = "md",
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex rounded-md border bg-muted/40 p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-[5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Un sí/no con su etiqueta, la fila entera es clickeable. */
export function SwitchRow({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string;
  icon?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-md py-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors",
          checked ? "bg-primary" : "bg-input"
        )}
      >
        <span
          className={cn(
            "inline-block size-4 rounded-full bg-background shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </span>
    </button>
  );
}

/**
 * Una lista de opciones de un solo valor (provincia, ciudad, barrio), con
 * buscador cuando son muchas. Tocar la elegida la quita.
 */
export function OptionList({
  options,
  value,
  onChange,
  searchPlaceholder = "Buscar…",
  emptyText = "Sin opciones",
}: {
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const searchable = options.length > 8;
  const visible = useMemo(() => {
    const q = normalize(query);
    return q ? options.filter((o) => normalize(o).includes(q)) : options;
  }, [options, query]);

  if (options.length === 0) return <p className="text-xs text-muted-foreground">{emptyText}</p>;

  return (
    <div className="rounded-md border">
      {searchable && (
        <div className="relative border-b">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 rounded-none border-0 pl-8 shadow-none focus-visible:ring-0"
          />
        </div>
      )}
      <div className="max-h-48 space-y-0.5 overflow-y-auto p-1" role="listbox" aria-label={searchPlaceholder}>
        {visible.length === 0 && <p className="px-2.5 py-2 text-xs text-muted-foreground">Nada coincide con «{query}»</p>}
        {visible.map((o) => {
          const active = o === value;
          return (
            <button
              key={o}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onChange(active ? null : o)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm transition-colors",
                active ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
              )}
            >
              <span className="truncate">{o}</span>
              {active && <X size={12} className="ml-auto shrink-0 text-muted-foreground" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * La búsqueda de la lista: se aplica sola después de una pausa al escribir, y al
 * instante con Enter. Devuelve el valor ya aplicado.
 */
export function useDebouncedValue(value: string, delayMs = 350): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
