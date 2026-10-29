"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Plus } from "@/components/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { TaskTagDTO } from "@/lib/crm-tasks";

/** Colores para etiquetas nuevas. Se elige por el nombre, así "Cobranza" siempre sale igual. */
const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6"];

function colorFor(name: string): string {
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function TaskTagChip({
  tag,
  onClick,
  active,
}: {
  tag: TaskTagDTO;
  onClick?: () => void;
  active?: boolean;
}) {
  const style = { backgroundColor: tag.color + "33", color: tag.color, border: `1px solid ${tag.color}55` };
  const className = cn(
    "inline-flex max-w-[9rem] items-center truncate rounded-full px-1.5 text-[10.5px] font-medium leading-4",
    active && "ring-1 ring-current",
  );
  if (!onClick) return <span className={className} style={style}>{tag.name}</span>;
  return (
    <button type="button" onClick={onClick} className={cn(className, "hover:opacity-80")} style={style} title={`Ver solo «${tag.name}»`}>
      {tag.name}
    </button>
  );
}

/**
 * Selector de etiquetas de una tarea: busca en las que ya existen y, si lo que
 * se escribió no está, ofrece crearla. Lo que se crea queda en el catálogo del
 * equipo para la próxima tarea.
 */
export function TaskTagPicker({
  allTags,
  selectedIds,
  onChange,
  onCreated,
  children,
}: {
  allTags: TaskTagDTO[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Avisa que hay una etiqueta nueva en el catálogo. */
  onCreated: (tag: TaskTagDTO) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const clean = query.trim().replace(/\s+/g, " ");
  const matches = useMemo(() => {
    const q = clean.toLowerCase();
    return q ? allTags.filter((t) => t.name.toLowerCase().includes(q)) : allTags;
  }, [allTags, clean]);
  const exact = allTags.find((t) => t.name.toLowerCase() === clean.toLowerCase());

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  async function create() {
    if (!clean || creating) return;
    if (exact) {
      if (!selectedIds.includes(exact.id)) toggle(exact.id);
      setQuery("");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/task-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean, color: colorFor(clean) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo crear la etiqueta");
        return;
      }
      const tag: TaskTagDTO = { id: data.id, name: data.name, color: data.color };
      onCreated(tag);
      if (!selectedIds.includes(tag.id)) onChange([...selectedIds, tag.id]);
      setQuery("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) { setQuery(""); setError(""); }
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            // Enter con una sola coincidencia la marca; si no, crea lo escrito.
            if (!exact && matches.length === 1) {
              toggle(matches[0].id);
              setQuery("");
            } else {
              create();
            }
          }}
          maxLength={40}
          placeholder="Buscar o crear etiqueta…"
          className="h-9 w-full border-b bg-transparent px-2.5 text-sm outline-none"
          aria-label="Buscar o crear etiqueta"
        />
        <ul className="max-h-56 overflow-y-auto py-1" role="listbox" aria-multiselectable>
          {matches.map((t) => {
            const selected = selectedIds.includes(t.id);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => toggle(t.id)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              </li>
            );
          })}
          {clean && !exact && (
            <li>
              <button
                type="button"
                onClick={create}
                disabled={creating}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                <span className="truncate">Crear «{clean}»</span>
              </button>
            </li>
          )}
          {!clean && allTags.length === 0 && (
            <li className="px-2.5 py-2 text-xs text-muted-foreground">Todavía no hay etiquetas. Escribí una para crearla.</li>
          )}
        </ul>
        {error && <p className="border-t px-2.5 py-1.5 text-xs text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
