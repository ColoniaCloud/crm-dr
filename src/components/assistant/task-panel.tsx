"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckSquare, Plus, Trash2, Loader2, CalendarDays, User, Flag, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskDTO } from "@/lib/crm-tasks";
import { LeadOutcomeDialog } from "@/components/assistant/lead-outcome-dialog";

type Scope = "mine" | "team";
interface TeamUser { id: string; name: string }

const PRIORITY: Record<string, { label: string; className: string }> = {
  HIGH:   { label: "Alta",  className: "text-red-600 dark:text-red-400" },
  MEDIUM: { label: "Media", className: "text-amber-600 dark:text-amber-400" },
  LOW:    { label: "Baja",  className: "text-muted-foreground" },
};

const AR_TZ = "America/Argentina/Buenos_Aires";

/** "YYYY-MM-DD" de hoy en Argentina, para comparar vencimientos por día. */
function todayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: AR_TZ });
}

function dueLabel(iso: string): { text: string; overdue: boolean; today: boolean } {
  const d = new Date(iso);
  const key = d.toLocaleDateString("en-CA", { timeZone: AR_TZ });
  const today = todayKey();
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: AR_TZ });
  const time = d.toLocaleTimeString("es-AR", { timeZone: AR_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const withTime = time === "00:00" ? "" : ` ${time}`;
  if (key === today) return { text: `Hoy${withTime}`, overdue: false, today: true };
  if (key === tomorrow) return { text: `Mañana${withTime}`, overdue: false, today: false };
  const text = d.toLocaleDateString("es-AR", { timeZone: AR_TZ, weekday: "short", day: "numeric", month: "short" }) + withTime;
  return { text, overdue: key < today, today: false };
}

export function TaskPanel({
  isAdmin,
  currentUserId,
  refreshKey,
  onChanged,
  className,
}: {
  isAdmin: boolean;
  currentUserId: string | undefined;
  refreshKey: number;
  /** Avisa al calendario que algo con fecha cambió. */
  onChanged: () => void;
  className?: string;
}) {
  const [scope, setScope] = useState<Scope>("mine");
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [tasks, setTasks] = useState<TaskDTO[] | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [showDone, setShowDone] = useState(false);

  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  // Tarea de un agente a la que se le está cargando el resultado.
  const [outcomeTask, setOutcomeTask] = useState<TaskDTO | null>(null);
  const [openNotes, setOpenNotes] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = scope === "team" ? `?scope=team${teamFilter ? `&userId=${encodeURIComponent(teamFilter)}` : ""}` : "";
    try {
      const res = await fetch(`/api/tasks${qs}`, { cache: "no-store" });
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch {
      setTasks([]);
    }
  }, [scope, teamFilter]);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setUsers(d.map((u: TeamUser) => ({ id: u.id, name: u.name }))))
      .catch(() => {});
  }, [isAdmin]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          // Un día sin hora se guarda a las 00:00 de Argentina.
          dueDate: due ? `${due}T00:00:00-03:00` : null,
          priority: priority || null,
          assigneeId: assignee || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "No se pudo crear la tarea");
        return;
      }
      setTitle("");
      setDue("");
      setPriority("");
      setAssignee("");
      await load();
      if (data.dueDate) onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function toggle(task: TaskDTO) {
    // Cerrar una tarea "Contactar a X" del Priorizador pide cómo salió.
    if (!task.done && task.agentId && task.contactId) {
      setOutcomeTask(task);
      return;
    }
    setTasks((prev) => prev?.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)) ?? null);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.done }),
    });
    if (task.dueDate) onChanged();
  }

  async function remove(task: TaskDTO) {
    setTasks((prev) => prev?.filter((t) => t.id !== task.id) ?? null);
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (task.dueDate) onChanged();
  }

  const { pending, done } = useMemo(() => {
    const list = tasks ?? [];
    const pend = list
      .filter((t) => !t.done)
      .sort((a, b) => {
        // Con fecha primero (la más próxima arriba), después sin fecha por creación.
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
    return { pending: pend, done: list.filter((t) => t.done) };
  }, [tasks]);

  const visible = showDone ? [...pending, ...done] : pending;

  return (
    <section className={cn("flex min-h-0 flex-col rounded-xl border bg-card", className)} aria-label="Tareas">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <CheckSquare className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Tareas</h2>
        <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{pending.length}</span>

        <div className="ml-auto flex items-center gap-1.5">
          {isAdmin && scope === "team" && (
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="h-7 max-w-[8.5rem] rounded-md border bg-background px-1.5 text-xs"
              aria-label="Filtrar por persona"
            >
              <option value="">Todo el equipo</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
          {isAdmin && (
            <div className="flex rounded-md bg-muted p-0.5 text-xs" role="tablist">
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
                  {s === "mine" ? "Mías" : "Equipo"}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <form onSubmit={addTask} className="shrink-0 space-y-1.5 border-b px-3 py-2">
        <div className="flex gap-1.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nueva tarea…"
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            title="Agregar tarea"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
        {title.trim() && (
          <div className="flex flex-wrap gap-1.5">
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="h-7 rounded-md border bg-background px-1.5 text-xs"
              aria-label="Vencimiento"
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="h-7 rounded-md border bg-background px-1.5 text-xs"
              aria-label="Prioridad"
            >
              <option value="">Sin prioridad</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Media</option>
              <option value="LOW">Baja</option>
            </select>
            {isAdmin && (
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="h-7 max-w-[10rem] rounded-md border bg-background px-1.5 text-xs"
                aria-label="Asignar a"
              >
                <option value="">Para mí</option>
                {users.filter((u) => u.id !== currentUserId).map((u) => (
                  <option key={u.id} value={u.id}>Asignar a {u.name}</option>
                ))}
              </select>
            )}
          </div>
        )}
        {formError && <p className="text-xs text-destructive">{formError}</p>}
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tasks === null ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-7 animate-pulse rounded bg-muted" />)}
          </div>
        ) : visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {scope === "team" ? "Nadie del equipo tiene tareas pendientes." : "No tenés tareas pendientes. Podés pedírselas al asistente: “recordame…”"}
          </p>
        ) : (
          <ul className="divide-y">
            {visible.map((t) => {
              const due = t.dueDate ? dueLabel(t.dueDate) : null;
              const pr = t.priority ? PRIORITY[t.priority] : null;
              const showOwner = t.userId !== currentUserId && t.userName;
              return (
                <li key={t.id} className="group flex items-start gap-2.5 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => toggle(t)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                    aria-label={t.done ? "Marcar como pendiente" : "Marcar como hecha"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm leading-snug", t.done && "text-muted-foreground line-through")}>
                      {t.agentId && <Bot className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-primary" aria-label="Creada por un agente" />}
                      {t.title}
                    </p>
                    {t.notes && !t.done && (
                      <button
                        type="button"
                        onClick={() => setOpenNotes(openNotes === t.id ? null : t.id)}
                        className={cn(
                          "mt-0.5 block w-full whitespace-pre-line text-left text-[11px] text-muted-foreground",
                          openNotes !== t.id && "line-clamp-1"
                        )}
                        title={openNotes === t.id ? "Ver menos" : "Ver por qué y qué decirle"}
                      >
                        {t.notes}
                      </button>
                    )}
                    {(due || pr || showOwner || t.contactName || t.assignedByName) && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                        {due && (
                          <span
                            className={cn(
                              "flex items-center gap-1",
                              !t.done && due.overdue && "font-medium text-red-600 dark:text-red-400",
                              !t.done && due.today && "font-medium text-foreground",
                            )}
                          >
                            <CalendarDays className="h-3 w-3" />
                            {due.text}
                          </span>
                        )}
                        {pr && (
                          <span className={cn("flex items-center gap-1", pr.className)}>
                            <Flag className="h-3 w-3" />
                            {pr.label}
                          </span>
                        )}
                        {t.contactName && (
                          t.contactId ? (
                            <Link href={`/leads/${t.contactId}`} className="truncate hover:text-foreground hover:underline">· {t.contactName}</Link>
                          ) : (
                            <span className="truncate">· {t.contactName}</span>
                          )
                        )}
                        {showOwner && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {t.userName}
                          </span>
                        )}
                        {t.assignedByName && t.userId === currentUserId && (
                          <span>· te la asignó {t.assignedByName}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                    title="Eliminar tarea"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {done.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="w-full px-3 py-2 text-left text-[11px] text-muted-foreground hover:text-foreground"
          >
            {showDone ? "Ocultar completadas" : `Ver completadas (${done.length})`}
          </button>
        )}
      </div>
      <LeadOutcomeDialog
        task={outcomeTask}
        onClose={() => setOutcomeTask(null)}
        onDone={() => {
          setOutcomeTask(null);
          load();
          onChanged();
        }}
      />
    </section>
  );
}
