"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bot, Plus, Clock, Inbox, Wallet, ChevronRight, Loader2, Lock } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  apiJson, describeSchedule, formatDateTimeAR, STATUS_DOT, STATUS_LABEL, usd, type AgentDTO,
} from "@/components/agents/types";
import { ScheduleFields } from "@/components/agents/schedule-fields";

interface CatalogItem {
  kind: string;
  label: string;
  description: string;
  defaultName: string;
  defaultInstructions: string;
  defaultScheduleTime: string;
  defaultScheduleDays: string;
  restricted: boolean;
}

interface ListResponse {
  agents: AgentDTO[];
  catalog: CatalogItem[];
  models: Array<{ id: string; label: string }>;
  canCreate: boolean;
  users: Array<{ id: string; name: string; email: string }>;
}

export default function AgentsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    apiJson<ListResponse>("/api/agents").then(setData).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const activos = data?.agents.filter((a) => a.status === "ACTIVE").length ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agentes</h1>
          <p className="text-sm text-muted-foreground">
            Empleados de IA con una función fija. El CRM decide a quién atienden; ellos redactan, avisan y te cuentan qué hicieron.
          </p>
        </div>
        {data?.canCreate && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo agente
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!data && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      )}

      {data && data.agents.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {activos} de {data.agents.length} {data.agents.length === 1 ? "agente activo" : "agentes activos"}
        </p>
      )}

      {data && data.agents.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center sm:py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-icon-chip">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium">Todavía no hay agentes</p>
              <p className="text-sm text-muted-foreground">
                {data.canCreate
                  ? "Creá el primero eligiendo una función del catálogo. Nace pausado: nada sale hasta que lo prendas."
                  : "Cuando un SUPERADMIN cree uno y te dé acceso, va a aparecer acá."}
              </p>
            </div>
            {data.canCreate && (
              <Button onClick={() => setCreating(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Crear agente
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {data?.agents.map((a) => (
          <Link key={a.id} href={`/agents/${a.id}`} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/40">
              <CardContent className="space-y-4 p-5 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-icon-chip">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{a.name}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      {a.kindLabel}
                      {a.visibleToUserIds && (
                        <span className="flex items-center gap-0.5" title="Solo lo ven sus dueños">
                          · <Lock className="h-3 w-3" /> Privado
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
                    <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[a.status])} />
                    {STATUS_LABEL[a.status]}
                  </span>
                </div>

                {a.lastRun?.summary && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{a.lastRun.summary.replace(/\*\*/g, "")}</p>
                )}

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {a.status === "ACTIVE" && a.nextRunAt ? formatDateTimeAR(a.nextRunAt) : describeSchedule(a.scheduleTime, a.scheduleDays)}
                    </span>
                  </div>
                  <div className={cn("flex items-center gap-1.5", a.pendingCount > 0 ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                    <Inbox className="h-3.5 w-3.5 shrink-0" />
                    {a.pendingCount} pendiente{a.pendingCount === 1 ? "" : "s"}
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Wallet className="h-3.5 w-3.5 shrink-0" />
                    {usd(a.monthSpendUsd)} / {usd(a.monthlyBudgetUsd)}
                  </div>
                </div>
                <div className="flex items-center justify-end text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Abrir <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {data?.canCreate && (
        <CreateAgentDialog open={creating} onOpenChange={setCreating} catalog={data.catalog} models={data.models} users={data.users} />
      )}
    </div>
  );
}

function CreateAgentDialog({
  open,
  onOpenChange,
  catalog,
  models,
  users,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  catalog: CatalogItem[];
  models: Array<{ id: string; label: string }>;
  users: Array<{ id: string; name: string; email: string }>;
}) {
  const { data: session } = useSession();
  const [owners, setOwners] = useState<string[]>([]);
  const router = useRouter();
  const inicial = catalog[0];
  const [kind, setKind] = useState(inicial?.kind ?? "");
  const [name, setName] = useState(inicial?.defaultName ?? "");
  const [instructions, setInstructions] = useState(inicial?.defaultInstructions ?? "");
  const [time, setTime] = useState(inicial?.defaultScheduleTime ?? "09:00");
  const [days, setDays] = useState<number[]>(inicial ? inicial.defaultScheduleDays.split(",").map(Number) : [1, 2, 3, 4, 5]);
  const [model, setModel] = useState(models[0]?.id ?? "");
  const [budget, setBudget] = useState("10");
  const [operatorCanChat, setOperatorCanChat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tipo = catalog.find((c) => c.kind === kind);
  const yo = session?.user?.id;

  /** Al cambiar de función se cargan sus valores por defecto. */
  function selectKind(c: CatalogItem) {
    setKind(c.kind);
    setName(c.defaultName);
    setInstructions(c.defaultInstructions);
    setTime(c.defaultScheduleTime);
    setDays(c.defaultScheduleDays.split(",").map(Number));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const { agent } = await apiJson<{ agent: AgentDTO }>("/api/agents", {
        method: "POST",
        body: JSON.stringify({
          kind,
          name,
          instructions,
          scheduleTime: days.length ? time : null,
          scheduleDays: days.length ? days.join(",") : null,
          model,
          monthlyBudgetUsd: Number(budget),
          operatorCanChat,
          ...(tipo?.restricted ? { visibleToUserIds: owners } : {}),
        }),
      });
      router.push(`/agents/${agent.id}?tab=config`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo agente</DialogTitle>
          <DialogDescription>
            Nace pausado. Lo revisás, probás una ronda con “Ejecutar ahora” y lo prendés cuando esté listo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Función</Label>
            <div className="grid gap-2">
              {catalog.map((c) => (
                <button
                  key={c.kind}
                  type="button"
                  onClick={() => selectKind(c)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    kind === c.kind ? "border-primary bg-primary/5" : "hover:bg-muted"
                  )}
                >
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                </button>
              ))}
              <p className="text-xs text-muted-foreground">
                Próximamente: reporte de captación, seguimiento y primer contacto de leads, remitos sin firmar y revisor de garantías.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-name">Nombre</Label>
            <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-instr">Descripción del puesto</Label>
            <Textarea id="agent-instr" rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            <p className="text-xs text-muted-foreground">Cómo querés que trabaje y que te hable en el chat.</p>
          </div>

          <ScheduleFields time={time} setTime={setTime} days={days} setDays={setDays} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {models.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-budget">Tope mensual (US$)</Label>
              <Input id="agent-budget" type="number" min={0} step="1" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
          </div>

          {tipo?.restricted ? (
            <div className="space-y-1.5">
              <Label>Quiénes lo ven</Label>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {users.map((u) => {
                  const esYo = u.id === yo;
                  return (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={esYo || owners.includes(u.id)}
                        disabled={esYo}
                        onCheckedChange={(v) =>
                          setOwners(v === true ? [...new Set([...owners, u.id])] : owners.filter((x) => x !== u.id))
                        }
                      />
                      {u.name}
                      {esYo && <span className="text-xs text-muted-foreground">(vos)</span>}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Solo estas personas lo ven y reciben sus avisos, aunque haya otros SUPERADMIN. No se los audita.
              </p>
            </div>
          ) : (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={operatorCanChat} onCheckedChange={(v) => setOperatorCanChat(v === true)} className="mt-0.5" />
              <span>
                Los OPERATOR pueden chatear con este agente
                <span className="block text-xs text-muted-foreground">Van a ver lo mismo que el agente, saldos incluidos. No pueden aprobar envíos.</span>
              </span>
            </label>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !name.trim() || !instructions.trim()}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Crear agente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
