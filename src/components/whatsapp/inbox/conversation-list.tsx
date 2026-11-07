"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CheckCheck, Plus, Search } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/lib/whatsapp/inbox";

/** Hora si es de hoy, "ayer", o la fecha corta. */
function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Ayer";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

export function ConversationList({
  conversations,
  loading,
  error,
  selected,
  query,
  onQuery,
  onSelect,
  onNew,
}: {
  conversations: ConversationSummary[];
  loading: boolean;
  error: string | null;
  selected: string | null;
  query: string;
  onQuery: (q: string) => void;
  onSelect: (peer: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar por nombre o número"
            className="pl-8"
            aria-label="Buscar conversaciones"
          />
        </div>
        <Button variant="outline" size="icon" onClick={onNew} aria-label="Nuevo chat" title="Nuevo chat">
          <Plus />
        </Button>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {loading && conversations.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">Cargando…</li>
        )}
        {error && <li className="p-6 text-center text-sm text-destructive">{error}</li>}
        {!loading && !error && conversations.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">
            {query ? "Ninguna conversación coincide." : "Todavía no hay conversaciones."}
          </li>
        )}

        {conversations.map((c) => (
          <li key={c.peer}>
            <button
              type="button"
              onClick={() => onSelect(c.peer)}
              className={cn(
                "flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/60",
                selected === c.peer && "bg-muted"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn("truncate text-sm", c.awaitingReply ? "font-semibold" : "font-medium")}>
                    {c.name}
                  </span>
                  {c.autoCreated && (
                    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                      Nuevo
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                  {c.last.direction === "outbound" &&
                    (c.last.status === "delivered" || c.last.status === "read" ? (
                      <CheckCheck className={cn("size-3.5 shrink-0", c.last.status === "read" && "text-sky-500")} />
                    ) : (
                      <Check className="size-3.5 shrink-0" />
                    ))}
                  <span className="truncate">{c.last.preview || "…"}</span>
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[11px] text-muted-foreground">{when(c.last.timestamp)}</span>
                {c.awaitingReply && (
                  <span className="size-2 rounded-full bg-primary" aria-label="Esperando respuesta" />
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
