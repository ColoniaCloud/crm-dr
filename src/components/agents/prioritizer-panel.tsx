"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronDown, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AgentDetailExtras } from "@/components/agents/agent-panel";
import { apiJson, type AgentDTO, type PrioritizerConfig } from "@/components/agents/types";

/** Piezas del panel derecho propias del Priorizador de leads. */

// ─── Listas de hoy ───────────────────────────────────────────────────────────

interface SellerList {
  userId: string;
  name: string;
  active: boolean;
  quota: number;
  doneToday: number;
  tasks: Array<{
    id: string;
    contactId: string | null;
    title: string;
    sector: string;
    zone: string;
    since: string;
    carried: boolean;
    notes: string | null;
    priority: string | null;
  }>;
}

export function TodayLists({ agent, refreshKey }: { agent: AgentDTO; refreshKey: number }) {
  const [sellers, setSellers] = useState<SellerList[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ sellers: SellerList[] }>(`/api/agents/${agent.id}/lists`).then((d) => setSellers(d.sellers));
  }, [agent.id, refreshKey]);

  if (sellers === null) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </div>
    );
  }
  if (sellers.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Todavía no hay vendedores configurados. {agent.permissions.configure ? "Agregalos en Configuración." : ""}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Cada vendedor ve estas tareas en su panel y le llegan por mail a la mañana. Al cerrar una, carga cómo salió.
      </p>
      {sellers.map((s) => {
        const pct = Math.min(100, (s.doneToday / Math.max(1, s.quota)) * 100);
        return (
          <div key={s.userId} className="rounded-lg border bg-card">
            <button
              type="button"
              onClick={() => setOpen(open === s.userId ? null : s.userId)}
              className="flex w-full items-center gap-3 p-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  {!s.active && <Badge variant="outline" className="text-[10px]">Inactivo</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.tasks.length} pendiente{s.tasks.length === 1 ? "" : "s"} · {s.doneToday} cerrada{s.doneToday === 1 ? "" : "s"} hoy · cupo {s.quota}
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open === s.userId && "rotate-180")} />
            </button>
            {open === s.userId && (
              <ul className="divide-y border-t">
                {s.tasks.length === 0 && <li className="p-3 text-xs text-muted-foreground">Nada pendiente.</li>}
                {s.tasks.map((t) => (
                  <li key={t.id} className="space-y-0.5 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-x-2">
                      {t.contactId ? (
                        <Link href={`/leads/${t.contactId}`} className="font-medium hover:underline">{t.title}</Link>
                      ) : (
                        <span className="font-medium">{t.title}</span>
                      )}
                      {t.carried && <Badge variant="outline" className="text-[10px]">De días anteriores</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{t.sector} · {t.zone}</p>
                    {t.notes && <p className="whitespace-pre-line text-xs">{t.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Configuración ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function ZonePicker({
  value,
  onChange,
  zones,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  zones: AgentDetailExtras["zones"];
  placeholder: string;
}) {
  const label = new Map(zones.map((z) => [z.key, z.label]));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((k) => (
        <span key={k} className="flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs">
          {label.get(k) ?? k}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== k))} aria-label={`Quitar ${label.get(k) ?? k}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <select
        value=""
        onChange={(e) => e.target.value && onChange([...value, e.target.value])}
        className="h-7 rounded-md border bg-background px-1.5 text-xs"
        aria-label={placeholder}
      >
        <option value="">{placeholder}</option>
        {zones.filter((z) => !value.includes(z.key)).map((z) => (
          <option key={z.key} value={z.key}>{z.label}</option>
        ))}
      </select>
    </div>
  );
}

export function PrioritizerSettings({
  config,
  setConfig,
  extras,
}: {
  config: PrioritizerConfig;
  setConfig: (c: PrioritizerConfig) => void;
  extras: AgentDetailExtras;
}) {
  const nombre = new Map(extras.users.map((u) => [u.id, u.name]));
  const sectorLabel = new Map(extras.sectors.map((s) => [s.key, s.label]));
  const sinUsar = extras.users.filter((u) => !config.sellers.some((s) => s.userId === u.id));
  const sectoresFuera = extras.sectors.filter((s) => !config.sectorOrder.includes(s.key));

  const setSeller = (i: number, patch: Partial<PrioritizerConfig["sellers"][number]>) =>
    setConfig({ ...config, sellers: config.sellers.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const mover = (i: number, d: -1 | 1) => {
    const orden = [...config.sectorOrder];
    const j = i + d;
    if (j < 0 || j >= orden.length) return;
    [orden[i], orden[j]] = [orden[j], orden[i]];
    setConfig({ ...config, sectorOrder: orden });
  };

  return (
    <>
      <Section title="Vendedores">
        <p className="text-xs text-muted-foreground">
          Cada vendedor recibe hasta su cupo de tareas abiertas por día. Los leads sin vendedor se reparten según las zonas;
          los de zonas que no tiene nadie, de forma pareja.
        </p>
        {config.sellers.length === 0 && <p className="text-sm text-muted-foreground">Todavía no agregaste ninguno.</p>}
        {config.sellers.map((s, i) => (
          <div key={s.userId} className="space-y-2 rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{nombre.get(s.userId) ?? "(usuario borrado)"}</span>
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox checked={s.active} onCheckedChange={(v) => setSeller(i, { active: v === true })} /> Activo
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                Cupo
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={s.dailyQuota}
                  onChange={(e) => setSeller(i, { dailyQuota: Number(e.target.value) })}
                  className="h-7 w-16"
                />
              </label>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7 px-2"
                onClick={() => setConfig({ ...config, sellers: config.sellers.filter((_, j) => j !== i) })}
                aria-label="Quitar vendedor"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Zonas</Label>
              <ZonePicker
                value={s.zones}
                onChange={(zones) => setSeller(i, { zones })}
                zones={extras.zones}
                placeholder="+ Agregar zona"
              />
            </div>
          </div>
        ))}
        {sinUsar.length > 0 && (
          <select
            value=""
            onChange={(e) =>
              e.target.value &&
              setConfig({
                ...config,
                sellers: [...config.sellers, { userId: e.target.value, dailyQuota: 20, zones: [], active: true }],
              })
            }
            className="h-8 rounded-md border bg-background px-2 text-sm"
            aria-label="Agregar vendedor"
          >
            <option value="">+ Agregar vendedor</option>
            {sinUsar.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
      </Section>

      <Section title="Prioridad">
        <div className="space-y-1.5">
          <Label>Orden de sectores (el de arriba vale más)</Label>
          <ol className="space-y-1">
            {config.sectorOrder.map((k, i) => (
              <li key={k} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1 text-sm">
                <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                <span className="flex-1">{sectorLabel.get(k) ?? k}</span>
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label="Subir">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === config.sectorOrder.length - 1} className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label="Bajar">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, sectorOrder: config.sectorOrder.filter((x) => x !== k) })}
                  className="rounded p-1 hover:bg-muted"
                  aria-label="Quitar sector"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>
          {sectoresFuera.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sectoresFuera.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setConfig({ ...config, sectorOrder: [...config.sectorOrder, s.key] })}
                  className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
                >
                  <Plus className="h-3 w-3" /> {s.label}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Los sectores que no están en la lista van después de todos.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Zonas que suben para todos</Label>
          <ZonePicker
            value={config.boostZones}
            onChange={(boostZones) => setConfig({ ...config, boostZones })}
            zones={extras.zones}
            placeholder="+ Agregar zona"
          />
        </div>
      </Section>

      <Section title="Funcionamiento">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={config.assignUnassigned}
            onCheckedChange={(v) => setConfig({ ...config, assignUnassigned: v === true })}
            className="mt-0.5"
          />
          <span>
            Repartir los leads sin vendedor
            <span className="block text-xs text-muted-foreground">Se asignan a medida que entran en una lista, no todos de golpe.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={config.morningMail} onCheckedChange={(v) => setConfig({ ...config, morningMail: v === true })} className="mt-0.5" />
          <span>
            Mandar el mail de la mañana a cada vendedor
            <span className="block text-xs text-muted-foreground">Con la lista, por qué cada lead y cómo contactarlo.</span>
          </span>
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span>Un lead que no contestó vuelve a la cola a los</span>
          <Input
            type="number"
            min={1}
            max={180}
            value={config.retryNoAnswerDays}
            onChange={(e) => setConfig({ ...config, retryNoAnswerDays: Number(e.target.value) })}
            className="h-8 w-16"
          />
          <span>días</span>
        </div>
      </Section>
    </>
  );
}
