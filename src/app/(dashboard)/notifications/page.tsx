"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  Bell, BellOff, CheckCheck, Phone, CalendarDays, CheckCircle2,
} from "lucide-react";

interface Notif {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "hace un momento";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  CALL_ASSIGNED:    { label: "Llamada asignada",   icon: Phone,        color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  VISIT_ASSIGNED:   { label: "Visita asignada",    icon: CalendarDays, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  CALL_COMPLETED:   { label: "Llamada completada", icon: CheckCircle2, color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  VISIT_COMPLETED:  { label: "Visita completada",  icon: CheckCircle2, color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
};

export default function NotificationsPage() {
  const { status } = useSession();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [markingAll, setMarkingAll] = useState(false);

  const unread = notifs.filter((n) => !n.read).length;

  async function fetchNotifs() {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setNotifs(await res.json());
      setFetchError("");
    } catch (err) {
      setFetchError("No se pudieron cargar las notificaciones.");
      console.error("[notifications]", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === "authenticated") {
      fetchNotifs();
      return;
    }

    if (status === "unauthenticated") {
      setLoading(false);
      setNotifs([]);
      setFetchError("No autorizado. Iniciá sesión para ver notificaciones.");
    }
  }, [status]);

  async function markRead(id: string) {
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "PATCH" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      console.error("[notifications] markRead", err);
    }
  }

  async function markAllRead() {
    try {
      setMarkingAll(true);
      const res = await fetch("/api/notifications", { method: "POST" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error("[notifications] markAllRead", err);
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notificaciones</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Mostrando no leídas y de las últimas 24&nbsp;hs.
          </p>
        </div>
        {unread > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            disabled={markingAll}
            className="gap-2"
          >
            <CheckCheck className="h-4 w-4" />
            Marcar todo leído
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">
            {loading ? "Cargando…" : (
              notifs.length === 0
                ? "Sin notificaciones"
                : `${notifs.length} notificación${notifs.length !== 1 ? "es" : ""}${unread > 0 ? ` · ${unread} sin leer` : ""}`
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          {fetchError ? (
            <div className="px-6 py-8 text-center text-sm text-destructive">{fetchError}</div>
          ) : loading ? (
            <div className="space-y-0 divide-y">
              {[1, 2, 3].map((i) => (
                <div key={i} className="px-6 py-5 animate-pulse">
                  <div className="flex gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-1/3" />
                      <div className="h-3 bg-muted rounded w-full" />
                      <div className="h-3 bg-muted rounded w-2/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : notifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <BellOff className="h-10 w-10 opacity-20" />
              <p className="text-sm">No tenés notificaciones recientes.</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifs.map((n) => {
                const meta = TYPE_META[n.type] ?? { label: n.type, icon: Bell, color: "bg-zinc-100 text-zinc-600" };
                const Icon = meta.icon;

                return (
                  <div
                    key={n.id}
                    className={cn(
                      "px-6 py-5 transition-colors",
                      !n.read && "bg-blue-50/40 dark:bg-blue-950/10"
                    )}
                  >
                    <div className="flex gap-4">
                      {/* Icon */}
                      <div className={cn(
                        "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                        meta.color
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("text-sm leading-snug", !n.read && "font-semibold")}>
                              {n.title}
                            </span>
                            <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-4">
                              {meta.label}
                            </Badge>
                            {!n.read && (
                              <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap shrink-0" suppressHydrationWarning>
                            {timeAgo(n.createdAt)}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground mb-1" suppressHydrationWarning>{formatDate(n.createdAt)}</p>

                        {/* Rich message rendered as HTML */}
                        <div
                          className="mt-3 text-sm text-foreground/90 [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.message) }}
                        />

                        {/* Mark as read */}
                        {!n.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-3 h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5 px-2"
                            onClick={() => markRead(n.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Marcar como leída
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
