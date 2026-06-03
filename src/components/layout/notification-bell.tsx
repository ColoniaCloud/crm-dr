"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bell, BellDot, CheckCheck, CalendarDays, Phone, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize";

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

export function NotificationBell() {
  const { status } = useSession();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [fetchError, setFetchError] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifs.filter((n) => !n.read).length;

  async function fetchNotifs() {
    if (status !== "authenticated") return;
    try {
      const res = await fetch("/api/notifications");
      if (res.status === 401) {
        setNotifs([]);
        return;
      }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setNotifs(await res.json());
      setFetchError("");
    } catch (err) {
      setFetchError("No se pudieron actualizar las notificaciones.");
      console.error("[notification-bell] fetch error:", err);
    }
  }

  useEffect(() => {
    if (status !== "authenticated") {
      setNotifs([]);
      setFetchError("");
      return;
    }

    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30_000);
    return () => clearInterval(interval);
  }, [status]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function markRead(id: string) {
    if (status !== "authenticated") return;
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "PATCH" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      console.error("[notification-bell] markRead error:", err);
    }
  }

  async function markAllRead() {
    if (status !== "authenticated") return;
    try {
      const res = await fetch("/api/notifications", { method: "POST" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error("[notification-bell] markAllRead error:", err);
    }
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9"
        aria-label="Notificaciones"
        onClick={() => setOpen((v) => !v)}
      >
        {unread > 0 ? <BellDot className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-[calc(100vw-2rem)] sm:w-80 max-w-xs sm:max-w-none rounded-lg border bg-background shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Notificaciones</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-2 -mr-2 rounded-md"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todo leído
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {fetchError && (
              <div className="px-4 py-3 border-b text-xs text-destructive bg-destructive/5">
                {fetchError}
              </div>
            )}
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                <Bell className="h-8 w-8 opacity-30" />
                <p className="text-sm">Sin notificaciones</p>
              </div>
            ) : (
              notifs.map((n) => {
                const Icon = n.type === "VISIT_ASSIGNED" ? CalendarDays : Phone;
                const content = (
                  <div
                    key={n.id}
                    className={cn(
                      "flex gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer border-b last:border-0",
                      !n.read && "bg-blue-50/50 dark:bg-blue-950/20"
                    )}
                    onClick={() => { if (!n.read) markRead(n.id); setOpen(false); }}
                  >
                    <div className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      n.type === "VISIT_ASSIGNED" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm leading-snug", !n.read && "font-semibold")}>{n.title}</p>
                      <p
                        className="mt-0.5 text-xs text-muted-foreground line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.message) }}
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground/70" suppressHydrationWarning>{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.read && (
                      <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </div>
                );

                return n.link ? (
                  <Link key={n.id} href={n.link}>{content}</Link>
                ) : (
                  <div key={n.id}>{content}</div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t px-4 py-2.5">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Ver todas las notificaciones
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
