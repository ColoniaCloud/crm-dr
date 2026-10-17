"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Loader2 } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AgentDetailExtras } from "@/components/agents/agent-panel";
import { apiJson, DAY_LABELS, formatDateTimeAR, type AgentDTO, type TeamConfig } from "@/components/agents/types";

/** Piezas del panel derecho propias del Supervisor del equipo. */

// ─── Equipo ──────────────────────────────────────────────────────────────────

interface PersonMetrics {
  userId: string;
  name: string;
  tareas: { abiertas: number; vencidas: number; venceHoy: number; completadas: number; completadasATiempo: number; horasPromedioCierre: number | null };
  leads: { asignadosSinContactar: number; contactados: number; resultados: Record<string, number>; pasaronACliente: number };
  actividad: { acciones: number; ultima: string | null; porTipo: Record<string, number> };
  mail: { tieneCasilla: boolean; recibidos: number; respondidos: number; horasRespuestaMediana: number | null; sinResponder: number; noLeidos: number };
}

const OUTCOME: Record<string, string> = {
  INTERESTED: "le interesó",
  NOT_INTERESTED: "no le interesó",
  NO_ANSWER: "no contestó",
  CALL_BACK: "volver a llamar",
};

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className={cn("rounded-md bg-muted/50 px-2 py-1", warn && "bg-amber-500/10")}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold", warn && "text-amber-700 dark:text-amber-300")}>{value}</p>
    </div>
  );
}

export function TeamOverview({ agent, refreshKey }: { agent: AgentDTO; refreshKey: number }) {
  const [days, setDays] = useState(7);
  const [people, setPeople] = useState<PersonMetrics[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    apiJson<{ people: PersonMetrics[] }>(`/api/agents/${agent.id}/team?days=${days}`).then((d) => {
      if (vivo) setPeople(d.people);
    });
    return () => {
      vivo = false;
    };
  }, [agent.id, days, refreshKey]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs text-muted-foreground">Confidencial: solo lo ven los dueños del agente.</p>
        <div className="flex rounded-md bg-muted p-0.5 text-xs" role="tablist">
          {[7, 30].map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={days === d}
              onClick={() => { setPeople(null); setDays(d); }}
              className={cn("rounded px-2 py-0.5", days === d ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
            >
              {d} días
            </button>
          ))}
        </div>
      </div>

      {people === null && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculando…
        </div>
      )}
      {people?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No hay nadie para auditar.</p>}

      {people?.map((p) => {
        const alerta = p.tareas.vencidas > 0 || p.mail.sinResponder > 0;
        return (
          <div key={p.userId} className="rounded-lg border bg-card">
            <button type="button" onClick={() => setOpen(open === p.userId ? null : p.userId)} className="flex w-full items-center gap-3 p-3 text-left">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  {alerta && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-label="Necesita atención" />}
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.tareas.completadas} cerradas · {p.tareas.vencidas} vencidas · {p.leads.contactados} leads contactados · última actividad{" "}
                  {p.actividad.ultima ? formatDateTimeAR(p.actividad.ultima) : "—"}
                </p>
              </div>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open === p.userId && "rotate-180")} />
            </button>
            {open === p.userId && (
              <div className="space-y-3 border-t p-3 text-sm">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tareas</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    <Stat label="Abiertas" value={p.tareas.abiertas} />
                    <Stat label="Vencidas" value={p.tareas.vencidas} warn={p.tareas.vencidas > 0} />
                    <Stat label="Vencen hoy" value={p.tareas.venceHoy} />
                    <Stat label="Cerradas" value={p.tareas.completadas} />
                    <Stat label="A tiempo" value={p.tareas.completadas ? `${Math.round((p.tareas.completadasATiempo / p.tareas.completadas) * 100)} %` : "—"} />
                    <Stat label="Horas para cerrar" value={p.tareas.horasPromedioCierre ?? "—"} />
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Leads</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    <Stat label="Contactados" value={p.leads.contactados} />
                    <Stat label="Pasaron a cliente" value={p.leads.pasaronACliente} />
                    <Stat label="Asignados sin contactar" value={p.leads.asignadosSinContactar} />
                  </div>
                  {Object.keys(p.leads.resultados).length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {Object.entries(p.leads.resultados).map(([k, v]) => `${v} ${OUTCOME[k] ?? k}`).join(" · ")}
                    </p>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mails de clientes</p>
                  {p.mail.tieneCasilla ? (
                    <div className="grid grid-cols-3 gap-1.5">
                      <Stat label="Recibidos" value={p.mail.recibidos} />
                      <Stat label="Respondidos" value={p.mail.respondidos} />
                      <Stat label="Horas (mediana)" value={p.mail.horasRespuestaMediana ?? "—"} />
                      <Stat label="Sin responder" value={p.mail.sinResponder} warn={p.mail.sinResponder > 0} />
                      <Stat label="Sin leer" value={p.mail.noLeidos} />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No tiene casilla de mail configurada en el CRM.</p>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actividad en el CRM</p>
                  <p className="text-xs">{p.actividad.acciones} acción(es) en el período</p>
                  {Object.keys(p.actividad.porTipo).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(p.actividad.porTipo).map(([k, v]) => (
                        <Badge key={k} variant="outline" className="text-[10px]">{k.toLowerCase().replace(/_/g, " ")}: {v}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">
        WhatsApp no entra en la respuesta a clientes: el CRM guarda lo que se manda pero no lo que llega.
      </p>
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

function NumberField({ label, value, onChange, min, max, suffix }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; suffix?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="flex-1">{label}</span>
      <Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-8 w-20" />
      {suffix && <span className="w-12 text-xs text-muted-foreground">{suffix}</span>}
    </label>
  );
}

export function TeamSettings({
  config,
  setConfig,
  owners,
  setOwners,
  currentUserId,
  extras,
}: {
  config: TeamConfig;
  setConfig: (c: TeamConfig) => void;
  owners: string[];
  setOwners: (ids: string[]) => void;
  currentUserId: string | undefined;
  extras: AgentDetailExtras;
}) {
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

  return (
    <>
      <Section title="Dueños (los únicos que ven este agente)">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {extras.users.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={owners.includes(u.id)}
                disabled={u.id === currentUserId}
                onCheckedChange={(v) => setOwners(toggle(owners, u.id, v === true))}
              />
              {u.name}
              {u.id === currentUserId && <span className="text-xs text-muted-foreground">(vos)</span>}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Los dueños no se auditan. Nadie más lo ve, aunque sea SUPERADMIN.</p>
      </Section>

      <Section title="A quiénes no audita">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {extras.users.filter((u) => !owners.includes(u.id)).map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={config.excludedUserIds.includes(u.id)}
                onCheckedChange={(v) => setConfig({ ...config, excludedUserIds: toggle(config.excludedUserIds, u.id, v === true) })}
              />
              {u.name}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Las cuentas de prueba (que terminan en .local o .test) nunca se auditan.</p>
      </Section>

      <Section title="Recordatorios a cada persona">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={config.morningSummary} onCheckedChange={(v) => setConfig({ ...config, morningSummary: v === true })} className="mt-0.5" />
          <span>Resumen de la mañana con lo que vence hoy</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={config.overdueReminders} onCheckedChange={(v) => setConfig({ ...config, overdueReminders: v === true })} className="mt-0.5" />
          <span>Recordar las tareas atrasadas (uno por día, como máximo)</span>
        </label>
        <NumberField
          label="Deja de insistir y les avisa a los dueños a los"
          value={config.escalateAfterDays}
          onChange={(n) => setConfig({ ...config, escalateAfterDays: n })}
          min={1}
          max={30}
          suffix="días"
        />
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={config.channels.notification} onCheckedChange={(v) => setConfig({ ...config, channels: { ...config.channels, notification: v === true } })} />
            Campanita del CRM
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={config.channels.email} onCheckedChange={(v) => setConfig({ ...config, channels: { ...config.channels, email: v === true } })} />
            Mail
          </label>
        </div>
      </Section>

      <Section title="Informes para los dueños">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={config.weeklyReport} onCheckedChange={(v) => setConfig({ ...config, weeklyReport: v === true })} />
          Resumen semanal por mail, los
          <select
            value={config.weeklyDay}
            onChange={(e) => setConfig({ ...config, weeklyDay: Number(e.target.value) })}
            className="h-7 rounded-md border bg-background px-1.5 text-xs"
            aria-label="Día del resumen semanal"
          >
            {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">Sale en la ronda de ese día: tiene que ser uno de los días del horario.</p>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={config.alerts.enabled} onCheckedChange={(v) => setConfig({ ...config, alerts: { ...config.alerts, enabled: v === true } })} />
          Alertas en el momento (lunes a viernes, de 9 a 19)
        </label>
        {config.alerts.enabled && (
          <div className="space-y-2 pl-6">
            <NumberField label="Sin actividad en el CRM durante" value={config.alerts.inactiveDays} onChange={(n) => setConfig({ ...config, alerts: { ...config.alerts, inactiveDays: n } })} min={1} max={30} suffix="días háb." />
            <NumberField label="Tareas vencidas a la vez, desde" value={config.alerts.overdueTasks} onChange={(n) => setConfig({ ...config, alerts: { ...config.alerts, overdueTasks: n } })} min={1} max={100} />
            <NumberField label="Mail de un cliente sin responder hace más de" value={config.alerts.unansweredMailHours} onChange={(n) => setConfig({ ...config, alerts: { ...config.alerts, unansweredMailHours: n } })} min={4} max={240} suffix="horas" />
          </div>
        )}
      </Section>

    </>
  );
}
