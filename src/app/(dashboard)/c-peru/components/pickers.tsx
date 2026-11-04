"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "@/components/icons";

function useCloseOnOutsideClick(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, close]);
}

/** Desplegable con buscador, para listas largas (departamentos, distritos). */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  useCloseOnOutsideClick(containerRef, () => setOpen(false));

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex items-center gap-2 truncate">
          {icon}
          {value || <span className="text-muted-foreground">{placeholder}</span>}
        </span>
        <svg className="h-4 w-4 opacity-50 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="p-2">
            <Input
              placeholder={searchPlaceholder ?? "Buscar..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="h-8 text-sm"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto pb-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</li>
            ) : (
              filtered.map((o) => (
                <li
                  key={o}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground ${
                    value === o ? "bg-accent/50 font-medium" : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(o);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  {o}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Ciudad con sugerencias de la lista local; acepta cualquier texto. */
export function CityAutocomplete({
  value,
  onChange,
  department,
  cities,
}: {
  value: string;
  onChange: (v: string) => void;
  department: string;
  cities: string[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!department || value.length < 2) return [];
    const q = value.toLowerCase();
    return cities.filter((c) => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 20);
  }, [department, value, cities]);

  useCloseOnOutsideClick(containerRef, () => setOpen(false));

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={department ? "Escribí para filtrar ciudades..." : "Elegí un departamento primero"}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => filtered.length > 0 && setOpen(true)}
          autoComplete="off"
          disabled={!department}
          required
        />
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-52 overflow-y-auto">
          {filtered.map((c) => (
            <li
              key={c}
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(c);
                setOpen(false);
              }}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
