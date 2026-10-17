"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Ban, Check, ChevronDown, FileDown, Loader2, Mail, Pencil, Send, Trash2,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ScheduleFields } from "@/components/agents/schedule-fields";
import {
  apiJson, formatDateTimeAR, usd,
  type AgentActionDTO, type AgentConfig, type AgentDTO, type AgentRunDTO, type CollectionsConfig, type PrioritizerConfig, type TeamConfig,
} from "@/components/agents/types";
import { PrioritizerSettings, TodayLists } from "@/components/agents/prioritizer-panel";
import { TeamOverview, TeamSettings } from "@/components/agents/team-panel";
import { useSession } from "next-auth/react";

export interface AgentDetailExtras {
  excludedContacts: Array<{ id: string; name: string }>;
  mailMode: "real" | "redirect" | "simulated" | "unconfigured";
  placeholders: ReadonlyArray<{ key: string; help: string }>;
  models: Array<{ id: string; label: string }>;
  users: Array<{ id: string; name: string; role: string }>;
  zones: Array<{ key: string; label: string; country: string }>;
  sectors: Array<{ key: string; label: string }>;
}

// Sin símbolo: la acción no guarda la moneda de la venta. El texto del mail sí la lleva.
const money = (n: number | null) =>
  n === null ? "-" : `Saldo ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

export function AgentPanel({
  agent,
  extras,
  tab,
  onTabChange,
  refreshKey,
  onChanged,
}: {
  agent: AgentDTO;
  extras: AgentDetailExtras;
  tab: string;
  onTabChange: (t: string) => void;
  refreshKey: number;
  onChanged: () => void;
}) {
  const tabs = agent.kind === "TEAM_SUPERVISOR"
    ? [
        { id: "team", label: "Equipo" },
        { id: "sent", label: "Avisos" },
        { id: "runs", label: "Ejecuciones" },
        ...(agent.permissions.configure ? [{ id: "config", label: "Configuración" }] : []),
      ]
    : agent.hasApprovals
    ? [
        { id: "pending", label: `Pendientes${agent.pendingCount ? ` (${agent.pendingCount})` : ""}` },
        { id: "runs", label: "Ejecuciones" },
        { id: "sent", label: "Envíos" },
        ...(agent.permissions.configure ? [{ id: "config", label: "Configuración" }] : []),
        { id: "reports", label: "Reportes" },
      ]
    : [
        { id: "today", label: "Listas de hoy" },
        { id: "runs", label: "Ejecuciones" },
        ...(agent.permissions.configure ? [{ id: "config", label: "Configuración" }] : []),
      ];
  const actual = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  return (
    <Tabs value={actual} onValueChange={onTabChange} className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 overflow-x-auto px-3 pt-3">
        <TabsList>
          {tabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
        </TabsList>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {agent.kind === "TEAM_SUPERVISOR" ? (
          <>
            <TabsContent value="team" className="mt-0">
              <TeamOverview agent={agent} refreshKey={refreshKey} />
            </TabsContent>
            <TabsContent value="sent" className="mt-0">
              <ActionsList agent={agent} status={null} refreshKey={refreshKey} onChanged={onChanged} />
            </TabsContent>
          </>
        ) : agent.hasApprovals ? (
          <>
            <TabsContent value="pending" className="mt-0">
              <ActionsList agent={agent} status="PENDING_APPROVAL" refreshKey={refreshKey} onChanged={onChanged} />
            </TabsContent>
            <TabsContent value="sent" className="mt-0">
              <ActionsList agent={agent} status={null} refreshKey={refreshKey} onChanged={onChanged} />
            </TabsContent>
            <TabsContent value="reports" className="mt-0">
              <ReportsPanel agent={agent} />
            </TabsContent>
          </>
        ) : (
          <TabsContent value="today" className="mt-0">
            <TodayLists agent={agent} refreshKey={refreshKey} />
          </TabsContent>
        )}
        <TabsContent value="runs" className="mt-0">
          <RunsList agent={agent} refreshKey={refreshKey} />
        </TabsContent>
        {agent.permissions.configure && (
          <TabsContent value="config" className="mt-0">
            <ConfigForm agent={agent} extras={extras} onChanged={onChanged} />
          </TabsContent>
        )}
      </div>
    </Tabs>
  );
}

// ─── Pendientes / Envíos ─────────────────────────────────────────────────────

const ACTION_STATUS: Record<AgentActionDTO["status"], { label: string; className: string }> = {
  PENDING_APPROVAL: { label: "Pendiente", className: "border-amber-500/40 text-amber-700 dark:text-amber-300" },
  SENT: { label: "Enviado", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" },
  DISCARDED: { label: "Descartado", className: "text-muted-foreground" },
  FAILED: { label: "Falló", className: "border-destructive/50 text-destructive" },
};

function ActionsList({
  agent,
  status,
  refreshKey,
  onChanged,
}: {
  agent: AgentDTO;
  status: "PENDING_APPROVAL" | null;
  refreshKey: number;
  onChanged: () => void;
}) {
  const [actions, setActions] = useState<AgentActionDTO[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pendientes = status === "PENDING_APPROVAL";

  const load = useCallback(() => {
    const q = status ? `?status=${status}` : "";
    apiJson<{ actions: AgentActionDTO[] }>(`/api/agents/${agent.id}/actions${q}`).then((d) => {
      setActions(d.actions);
      setSelected((s) => s.filter((id) => d.actions.some((a) => a.id === id)));
    });
  }, [agent.id, status]);
  useEffect(load, [load, refreshKey]);

  const seleccionables = useMemo(() => (actions ?? []).filter((a) => !a.inFlight), [actions]);

  async function bulk(op: "approve" | "discard", ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setMsg(null);
    try {
      if (op === "approve") {
        const r = await apiJson<{ result: Record<string, number> }>(`/api/agents/${agent.id}/actions`, {
          method: "POST",
          body: JSON.stringify({ op, ids }),
        });
        setMsg(
          `${r.result.SENT} enviado(s)` +
            (r.result.FAILED ? `, ${r.result.FAILED} fallaron` : "") +
            (r.result.DISCARDED ? `, ${r.result.DISCARDED} descartados porque ya no deben` : "")
        );
      } else {
        const r = await apiJson<{ discarded: number }>(`/api/agents/${agent.id}/actions`, {
          method: "POST",
          body: JSON.stringify({ op, ids }),
        });
        setMsg(`${r.discarded} descartado(s)`);
      }
      setSelected([]);
      load();
      onChanged();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (actions === null) return <Loading />;
  if (actions.length === 0) {
    return (
      <Empty>
        {pendientes ? "No hay nada esperando aprobación." : "El agente todavía no mandó ni preparó ningún mail."}
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {pendientes && agent.permissions.approve && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={selected.length > 0 && selected.length === seleccionables.length}
              onCheckedChange={(v) => setSelected(v === true ? seleccionables.map((a) => a.id) : [])}
            />
            Todos
          </label>
          <div className="ml-auto flex gap-2">
            <Button size="sm" disabled={busy || !selected.length} onClick={() => bulk("approve", selected)}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
              Aprobar y enviar {selected.length || ""}
            </Button>
            <Button size="sm" variant="outline" disabled={busy || !selected.length} onClick={() => bulk("discard", selected)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Descartar
            </Button>
          </div>
        </div>
      )}
      {pendientes && !agent.permissions.approve && (
        <p className="text-xs text-muted-foreground">Solo un SUPERADMIN puede aprobar o descartar envíos.</p>
      )}
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}

      {actions.map((a) => (
        <ActionItem
          key={a.id}
          agent={agent}
          action={a}
          selectable={pendientes && agent.permissions.approve && !a.inFlight}
          selected={selected.includes(a.id)}
          onSelect={(v) => setSelected((s) => (v ? [...s, a.id] : s.filter((x) => x !== a.id)))}
          onApprove={() => bulk("approve", [a.id])}
          busy={busy}
          onChanged={() => { load(); onChanged(); }}
        />
      ))}
    </div>
  );
}

function ActionItem({
  agent, action: a, selectable, selected, onSelect, onApprove, busy, onChanged,
}: {
  agent: AgentDTO;
  action: AgentActionDTO;
  selectable: boolean;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onApprove: () => void;
  busy: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(a.subject);
  const [body, setBody] = useState(a.body);
  const [error, setError] = useState<string | null>(null);
  const st = ACTION_STATUS[a.status];

  async function saveEdit() {
    setError(null);
    try {
      await apiJson(`/api/agents/${agent.id}/actions/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ op: "edit", subject, body }),
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function exclude() {
    if (!confirm(`¿No contactar más a ${a.contactName}? Se descartan sus pendientes y el agente no le vuelve a escribir.`)) return;
    try {
      await apiJson(`/api/agents/${agent.id}/actions/${a.id}`, { method: "PATCH", body: JSON.stringify({ op: "exclude_contact" }) });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const pendiente = a.status === "PENDING_APPROVAL";
  return (
    <div className={cn("rounded-lg border bg-card p-3 text-sm", selected && "border-primary/60")}>
      <div className="flex items-start gap-2">
        {selectable && <Checkbox checked={selected} onCheckedChange={(v) => onSelect(v === true)} className="mt-0.5" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{a.contactName}</span>
            <Badge variant="outline" className={cn("text-[10px]", st.className)}>
              {st.label}{a.simulated ? " · simulado" : ""}
            </Badge>
            {a.origin === "CHAT" && <Badge variant="outline" className="text-[10px]">Pedido por chat</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {a.saleNumber ? `Venta #${a.saleNumber} · ` : ""}
            {money(a.amount)}
            {a.dueDate ? ` · vence ${new Date(a.dueDate).toLocaleDateString("es-AR")}` : ""}
            {" · "}
            {a.sentAt ? `enviado ${formatDateTimeAR(a.sentAt)}` : `creado ${formatDateTimeAR(a.createdAt)}`}
          </p>
          <p className="mt-1 truncate text-xs">{a.subject}</p>
          {a.error && <p className="mt-1 text-xs text-destructive">{a.error}</p>}
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Ver texto">
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && !editing && (
        <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">{a.body}</p>
      )}
      {editing && (
        <div className="mt-2 space-y-2">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveEdit}>Guardar</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setSubject(a.subject); setBody(a.body); }}>Cancelar</Button>
          </div>
        </div>
      )}

      {pendiente && agent.permissions.approve && !editing && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" disabled={busy || a.inFlight} onClick={onApprove}>
            <Check className="mr-1 h-3.5 w-3.5" /> Aprobar
          </Button>
          <Button size="sm" variant="outline" disabled={a.inFlight} onClick={() => { setEditing(true); setOpen(true); }}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
          </Button>
          <Button size="sm" variant="ghost" onClick={exclude}>
            <Ban className="mr-1 h-3.5 w-3.5" /> No contactar más
          </Button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── Ejecuciones ─────────────────────────────────────────────────────────────

const RUN_STATUS: Record<AgentRunDTO["status"], { label: string; className: string }> = {
  RUNNING: { label: "En curso", className: "text-primary" },
  SUCCESS: { label: "OK", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" },
  PARTIAL: { label: "Con errores", className: "border-amber-500/40 text-amber-700 dark:text-amber-300" },
  FAILED: { label: "Falló", className: "border-destructive/50 text-destructive" },
  SKIPPED: { label: "Salteada", className: "text-muted-foreground" },
};

const STAT_LABELS: Array<[string, string]> = [
  ["revisadas", "Revisadas"],
  ["enviadas", "Enviadas"],
  ["pendientes", "Para aprobar"],
  ["fallidas", "Fallidas"],
  ["yaAvisadas", "Ya avisadas"],
  ["sinEmail", "Sin email"],
  ["declaracionPendiente", "Pago declarado"],
  ["escaladas", "Escaladas"],
];

function RunsList({ agent, refreshKey }: { agent: AgentDTO; refreshKey: number }) {
  const [runs, setRuns] = useState<AgentRunDTO[] | null>(null);
  useEffect(() => {
    apiJson<{ runs: AgentRunDTO[] }>(`/api/agents/${agent.id}/runs`).then((d) => setRuns(d.runs));
  }, [agent.id, refreshKey]);

  if (runs === null) return <Loading />;
  if (runs.length === 0) return <Empty>Todavía no corrió ninguna ronda.</Empty>;

  return (
    <div className="space-y-2">
      {runs.map((r) => {
        const st = RUN_STATUS[r.status];
        const stats = (r.stats ?? {}) as Record<string, number>;
        return (
          <details key={r.id} className="group rounded-lg border bg-card p-3 text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2">
              <Badge variant="outline" className={cn("text-[10px]", st.className)}>{st.label}</Badge>
              <span className="text-xs">{formatDateTimeAR(r.startedAt)}</span>
              <span className="text-xs text-muted-foreground">{r.trigger === "MANUAL" ? "manual" : "programada"}</span>
              <span className="ml-auto text-xs text-muted-foreground">{usd(r.costUsd)}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            {r.error && (
              <p className="mt-2 flex gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{r.error}</p>
            )}
            {r.summary && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{r.summary.replace(/\*\*/g, "")}</p>}
            {r.stats && (
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {STAT_LABELS.map(([k, label]) => (
                  <div key={k} className="rounded-md bg-muted/50 px-2 py-1">
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                    <p className="text-sm font-semibold">{stats[k] ?? 0}</p>
                  </div>
                ))}
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}

// ─── Configuración ───────────────────────────────────────────────────────────

const MAIL_MODE: Record<AgentDetailExtras["mailMode"], { text: string; className: string }> = {
  real: { text: "Los mails salen a los clientes desde la casilla de los agentes.", className: "border-emerald-500/40 bg-emerald-500/5" },
  redirect: { text: "Modo prueba: todos los mails van a la casilla de AGENTS_MAIL_REDIRECT_TO, no a los clientes.", className: "border-amber-500/40 bg-amber-500/5" },
  simulated: { text: "Envío simulado: este servidor no manda mails reales (desarrollo o demo).", className: "border-amber-500/40 bg-amber-500/5" },
  unconfigured: { text: "Falta configurar la casilla de los agentes (AGENTS_SMTP_USER / AGENTS_SMTP_PASS): los envíos van a fallar.", className: "border-destructive/50 bg-destructive/5" },
};

function ConfigForm({ agent, extras, onChanged }: { agent: AgentDTO; extras: AgentDetailExtras; onChanged: () => void }) {
  const [name, setName] = useState(agent.name);
  const [instructions, setInstructions] = useState(agent.instructions);
  const [time, setTime] = useState(agent.scheduleTime ?? "09:00");
  const [days, setDays] = useState<number[]>(agent.scheduleDays ? agent.scheduleDays.split(",").map(Number) : []);
  const [model, setModel] = useState(agent.model);
  const [budget, setBudget] = useState(String(agent.monthlyBudgetUsd));
  const [operatorCanChat, setOperatorCanChat] = useState(agent.operatorCanChat);
  const [config, setConfig] = useState<AgentConfig>(agent.config!);
  const [owners, setOwners] = useState<string[]>(agent.visibleToUserIds ?? []);
  const { data: session } = useSession();
  const restringido = Boolean(agent.visibleToUserIds);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mode = MAIL_MODE[extras.mailMode];

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await apiJson(`/api/agents/${agent.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          instructions,
          scheduleTime: days.length ? time : null,
          scheduleDays: days.length ? days.join(",") : null,
          model,
          monthlyBudgetUsd: Number(budget),
          operatorCanChat,
          config,
          ...(restringido ? { visibleToUserIds: owners } : {}),
        }),
      });
      setMsg({ ok: true, text: "Guardado." });
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function reinclude(contactId: string) {
    await apiJson(`/api/agents/${agent.id}/excluded/${contactId}`, { method: "DELETE" });
    setConfig((c) => {
      const cc = c as CollectionsConfig;
      return { ...cc, excludedContactIds: cc.excludedContactIds.filter((x) => x !== contactId) };
    });
    onChanged();
  }

  return (
    <div className="space-y-5 pb-6">
      {agent.kind === "COLLECTIONS" && (
        <div className={cn("flex gap-2 rounded-lg border p-2.5 text-xs", mode.className)}>
          <Mail className="h-4 w-4 shrink-0" />
          {mode.text}
        </div>
      )}

      <Section title="Puesto">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Descripción del puesto</Label>
          <Textarea rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </div>
      </Section>

      <Section title="Horario y costo">
        <ScheduleFields time={time} setTime={setTime} days={days} setDays={setDays} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Modelo</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {extras.models.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tope mensual (US$)</Label>
            <Input type="number" min={0} step="1" value={budget} onChange={(e) => setBudget(e.target.value)} />
            <p className="text-xs text-muted-foreground">Avisa al 80 % y se pausa solo al 100 %.</p>
          </div>
        </div>
        {!restringido && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={operatorCanChat} onCheckedChange={(v) => setOperatorCanChat(v === true)} className="mt-0.5" />
          <span>
            Los OPERATOR pueden chatear con este agente
            <span className="block text-xs text-muted-foreground">Ven lo mismo que el agente, saldos incluidos. No pueden aprobar.</span>
          </span>
        </label>
        )}
      </Section>

      {agent.kind === "COLLECTIONS" ? (
        <CollectionsSettings config={config as CollectionsConfig} setConfig={setConfig} extras={extras} reinclude={reinclude} />
      ) : agent.kind === "TEAM_SUPERVISOR" ? (
        <TeamSettings
          config={config as TeamConfig}
          setConfig={setConfig}
          owners={owners}
          setOwners={setOwners}
          currentUserId={session?.user?.id}
          extras={extras}
        />
      ) : (
        <PrioritizerSettings config={config as PrioritizerConfig} setConfig={setConfig} extras={extras} />
      )}

      <div className="sticky bottom-0 flex items-center gap-3 border-t bg-background/95 py-3 backdrop-blur">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Guardar cambios
        </Button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-emerald-600" : "text-destructive")}>{msg.text}</span>}
      </div>
    </div>
  );
}


function CollectionsSettings({
  config,
  setConfig,
  extras,
  reinclude,
}: {
  config: CollectionsConfig;
  setConfig: (c: CollectionsConfig) => void;
  extras: AgentDetailExtras;
  reinclude: (contactId: string) => void;
}) {
  const setStep = (i: number, patch: Partial<CollectionsConfig["steps"][number]>) =>
    setConfig({ ...config, steps: config.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <>
      <Section title="Cobranza">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Plazo de ventas sin plan (días desde la venta)</Label>
          <Input type="number" min={1} value={config.defaultTermDays} onChange={(e) => setConfig({ ...config, defaultTermDays: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Deja de escribir pasados (días de atraso)</Label>
          <Input type="number" min={1} value={config.escalateAfterDays} onChange={(e) => setConfig({ ...config, escalateAfterDays: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Las respuestas llegan a</Label>
          <Input type="email" value={config.replyTo} onChange={(e) => setConfig({ ...config, replyTo: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Firma</Label>
          <Input value={config.signature} onChange={(e) => setConfig({ ...config, signature: e.target.value })} />
        </div>
      </div>
    </Section>

    <Section title="Secuencia y plantillas">
      <p className="text-xs text-muted-foreground">
        Días negativos = antes del vencimiento. Variables:{" "}
        {extras.placeholders.map((p) => (
          <code key={p.key} title={p.help} className="mr-1 rounded bg-muted px-1">{`{{${p.key}}}`}</code>
        ))}
      </p>
      {config.steps.map((s, i) => (
        <details key={s.key} className="rounded-lg border bg-card p-3">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{s.label}</span>
            {!s.enabled && <Badge variant="outline" className="text-[10px]">Apagado</Badge>}
            <Badge variant="outline" className="text-[10px]">{s.requiresApproval ? "Con aprobación" : "Sale solo"}</Badge>
          </summary>
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Etiqueta</Label>
                <Input value={s.label} onChange={(e) => setStep(i, { label: e.target.value })} className="h-8 w-44" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Día</Label>
                <Input type="number" value={s.offsetDays} onChange={(e) => setStep(i, { offsetDays: Number(e.target.value) })} className="h-8 w-20" />
              </div>
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox checked={s.enabled} onCheckedChange={(v) => setStep(i, { enabled: v === true })} /> Activo
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox checked={s.requiresApproval} onCheckedChange={(v) => setStep(i, { requiresApproval: v === true })} /> Requiere aprobación
              </label>
            </div>
            <Input value={s.subject} onChange={(e) => setStep(i, { subject: e.target.value })} />
            <Textarea rows={7} value={s.body} onChange={(e) => setStep(i, { body: e.target.value })} className="text-xs" />
          </div>
        </details>
      ))}
      <details className="rounded-lg border bg-card p-3">
        <summary className="cursor-pointer list-none text-sm font-medium">Recordatorio pedido por chat</summary>
        <div className="mt-3 space-y-2">
          <Input value={config.manualSubject} onChange={(e) => setConfig({ ...config, manualSubject: e.target.value })} />
          <Textarea rows={7} value={config.manualBody} onChange={(e) => setConfig({ ...config, manualBody: e.target.value })} className="text-xs" />
        </div>
      </details>
    </Section>

    {extras.excludedContacts.length > 0 && (
      <Section title="Clientes que no se contactan">
        <ul className="space-y-1">
          {extras.excludedContacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-md border px-2 py-1 text-sm">
              {c.name}
              <Button size="sm" variant="ghost" onClick={() => reinclude(c.id)}>Volver a incluir</Button>
            </li>
          ))}
        </ul>
      </Section>
    )}
    </>
  );
}

// ─── Reportes ────────────────────────────────────────────────────────────────

function isoLocal(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

function ReportsPanel({ agent }: { agent: AgentDTO }) {
  const hoy = new Date();
  const [from, setFrom] = useState(isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [to, setTo] = useState(isoLocal(hoy));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const qs = `from=${from}&to=${to}`;

  async function mail() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiJson<{ to: string }>(`/api/agents/${agent.id}/report`, {
        method: "POST",
        body: JSON.stringify({ from, to }),
      });
      setMsg(`Enviado a ${r.to}.`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Qué mandó el agente en el período, cuánto se cobró después de cada aviso y cómo está la deuda hoy. También podés
        pedírselo en el chat (“armame el reporte de septiembre”).
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Desde</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hasta</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <a href={`/api/agents/${agent.id}/report?${qs}&format=pdf`}><FileDown className="mr-1.5 h-4 w-4" />PDF</a>
        </Button>
        <Button variant="outline" asChild>
          <a href={`/api/agents/${agent.id}/report?${qs}&format=csv`}><FileDown className="mr-1.5 h-4 w-4" />Excel (CSV)</a>
        </Button>
        <Button variant="outline" onClick={mail} disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />}
          Mandármelo por mail
        </Button>
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
