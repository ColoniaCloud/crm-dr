"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, RefreshCw } from "@/components/icons";
import { cn } from "@/lib/utils";
import { withLine } from "@/lib/whatsapp/line-url";
import type { TemplateRow, TemplateState } from "@/lib/whatsapp/template-rules";
import { NewTemplateDialog } from "./new-template-dialog";
import { TemplateButtonsPreview } from "./template-buttons";

const STATE: Record<TemplateState, { label: string; className: string }> = {
  approved: { label: "Aprobada", className: "border-green-500/30 bg-green-500/10 text-green-600" },
  pending: { label: "En revisión", className: "border-amber-500/30 bg-amber-500/10 text-amber-600" },
  rejected: { label: "Rechazada", className: "border-red-500/30 bg-red-500/10 text-red-600" },
  paused: { label: "Pausada", className: "border-border bg-muted text-muted-foreground" },
};

const CATEGORY: Record<string, string> = {
  UTILITY: "Utilidad",
  MARKETING: "Marketing",
  AUTHENTICATION: "Autenticación",
};

const FILTERS: { value: TemplateState | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "approved", label: "Aprobadas" },
  { value: "pending", label: "En revisión" },
  { value: "rejected", label: "Rechazadas" },
  { value: "paused", label: "Pausadas" },
];

/** Los motivos de rechazo de Meta, en castellano. */
const REJECTION: Record<string, string> = {
  INVALID_FORMAT: "Formato inválido (variables, saltos de línea o largo).",
  ABUSIVE_CONTENT: "Contenido que Meta considera abusivo.",
  TAG_CONTENT_MISMATCH: "La categoría no coincide con el contenido.",
  SCAM: "Meta lo consideró posible estafa.",
};

/**
 * Las plantillas de la cuenta con su estado, y el alta de nuevas.
 * El estado cambia del lado de Meta (revisión), así que se vuelve a pedir cada
 * minuto mientras la pestaña está a la vista.
 *
 * Las plantillas son de la cuenta de cada línea: `line` dice cuál se mira (sin
 * ella, la de por defecto de quien mira) y `lineLabel` viene solo si esa persona
 * puede usar más de una, para decir en cuál se está creando.
 */
export function TemplatesTab({ line, lineLabel }: { line?: string; lineLabel?: string }) {
  const [rows, setRows] = useState<TemplateRow[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<TemplateState | "all">("all");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (force: boolean) => {
    setRefreshing(true);
    try {
      const res = await fetch(withLine(`/api/whatsapp/templates?all=1${force ? "&refresh=1" : ""}`, line), { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar las plantillas");
      setRows(data.templates ?? []);
      setConfigured(data.configured !== false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setRefreshing(false);
    }
  }, [line]);

  useEffect(() => {
    void load(true);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load(false);
    }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const r of rows ?? []) c[r.state] = (c[r.state] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = (rows ?? []).filter((r) => filter === "all" || r.state === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? "default" : "outline"}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              <span className="text-xs opacity-70">{counts[f.value] ?? 0}</span>
            </Button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void load(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Actualizar
          </Button>
          <Button size="sm" onClick={() => setCreating(true)} disabled={!configured}>
            <Plus />
            Nueva plantilla
          </Button>
        </div>
      </div>

      {notice && (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          {notice}
        </p>
      )}
      {!configured && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          WhatsApp (Cloud API) no está configurado en este entorno.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!rows && !error && (
        <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" /> Cargando…
        </p>
      )}
      {rows && visible.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? "Todavía no hay plantillas." : "Ninguna plantilla con ese estado."}
        </p>
      )}

      <ul className="grid gap-3 lg:grid-cols-2">
        {visible.map((t) => (
          <li key={`${t.name}|${t.language}`} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 truncate font-mono text-sm font-medium">{t.name}</p>
              <Badge variant="outline" className={cn("ml-auto shrink-0", STATE[t.state].className)}>
                {STATE[t.state].label}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.language} · {CATEGORY[t.category] ?? t.category}
              {t.status !== "APPROVED" && t.status !== "PENDING" && t.state !== "rejected" ? ` · ${t.status}` : ""}
            </p>
            <div className="mt-3 whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm">
              {t.header && <p className="mb-1 font-semibold">{t.header}</p>}
              {t.body}
              {t.footer && <p className="mt-2 text-xs text-muted-foreground">{t.footer}</p>}
            </div>
            <TemplateButtonsPreview buttons={t.buttons} className="mt-1" />
            {t.state === "rejected" && (
              <p className="mt-2 text-xs text-red-600">
                {t.rejectedReason ? (REJECTION[t.rejectedReason] ?? t.rejectedReason) : "Meta la rechazó sin indicar el motivo."}{" "}
                Creá una nueva con los cambios.
              </p>
            )}
          </li>
        ))}
      </ul>

      {creating && (
        <NewTemplateDialog
          line={line}
          lineLabel={lineLabel}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setNotice("Plantilla enviada a revisión de Meta. Aparece como «En revisión» hasta que la aprueben.");
            void load(true);
          }}
        />
      )}
    </div>
  );
}
