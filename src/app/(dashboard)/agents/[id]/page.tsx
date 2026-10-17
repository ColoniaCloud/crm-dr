"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Bot, LayoutPanelLeft, Loader2, MessageSquare, Pause, Play } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentChat } from "@/components/agents/agent-chat";
import { AgentPanel, type AgentDetailExtras } from "@/components/agents/agent-panel";
import {
  apiJson, describeSchedule, formatDateTimeAR, STATUS_DOT, STATUS_LABEL, usd, type AgentDTO,
} from "@/components/agents/types";

export default function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <AgentPageInner id={id} />
    </Suspense>
  );
}

function AgentPageInner({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<({ agent: AgentDTO } & AgentDetailExtras) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobileTab, setMobileTab] = useState<"chat" | "panel">("chat");
  const [busy, setBusy] = useState<"toggle" | "run" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tab = searchParams.get("tab") ?? "pending";

  const load = useCallback(() => {
    apiJson<{ agent: AgentDTO } & AgentDetailExtras>(`/api/agents/${id}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(load, [load, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const openTab = useCallback(
    (t: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("tab", t);
      router.replace(`/agents/${id}?${sp.toString()}`, { scroll: false });
      setMobileTab("panel");
    },
    [id, router, searchParams]
  );

  if (error) {
    return (
      <div className="space-y-3">
        <Link href="/agents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Agentes
        </Link>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando agente…
      </div>
    );
  }

  const { agent } = data;
  const gastoPct = agent.monthlyBudgetUsd > 0 ? Math.min(100, (agent.monthSpendUsd / agent.monthlyBudgetUsd) * 100) : 0;

  async function toggle() {
    setBusy("toggle");
    setNotice(null);
    try {
      await apiJson(`/api/agents/${agent.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: agent.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }),
      });
      refresh();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runNow() {
    setBusy("run");
    setNotice(null);
    try {
      await apiJson(`/api/agents/${agent.id}/run`, { method: "POST" });
      setNotice("Ronda terminada. El parte quedó en el chat.");
      refresh();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="-m-3 relative flex flex-col overflow-hidden sm:-m-6" style={{ height: "calc(100dvh - 56px - 37px)" }}>
      {/* ── Cabecera ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b bg-background px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/agents" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Volver a agentes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-icon-chip">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold leading-tight">{agent.name}</h1>
              <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
                <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[agent.status])} />
                {STATUS_LABEL[agent.status]}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {agent.kindLabel} · {describeSchedule(agent.scheduleTime, agent.scheduleDays)}
              {agent.status === "ACTIVE" && agent.nextRunAt ? ` · próxima ronda ${formatDateTimeAR(agent.nextRunAt)}` : ""}
            </p>
          </div>

          <div className="hidden w-52 shrink-0 sm:block" title="Gasto del mes">
            <div className="flex justify-between gap-2 whitespace-nowrap text-[11px] text-muted-foreground">
              <span>Gasto del mes</span>
              <span>{usd(agent.monthSpendUsd)} / {usd(agent.monthlyBudgetUsd)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", gastoPct >= 100 ? "bg-destructive" : gastoPct >= 80 ? "bg-amber-500" : "bg-primary")}
                style={{ width: `${gastoPct}%` }}
              />
            </div>
          </div>

          {agent.permissions.configure && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={runNow} disabled={busy !== null}>
                {busy === "run" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                Ejecutar ahora
              </Button>
              <Button size="sm" variant={agent.status === "ACTIVE" ? "outline" : "default"} onClick={toggle} disabled={busy !== null}>
                {busy === "toggle" ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : agent.status === "ACTIVE" ? (
                  <Pause className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <Play className="mr-1 h-3.5 w-3.5" />
                )}
                {agent.status === "ACTIVE" ? "Pausar" : "Activar"}
              </Button>
            </div>
          )}

          <div className="flex rounded-lg bg-muted p-0.5 text-xs lg:hidden" role="tablist">
            {([
              { id: "chat", label: "Chat", icon: MessageSquare },
              { id: "panel", label: "Panel", icon: LayoutPanelLeft },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={mobileTab === t.id}
                onClick={() => setMobileTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors",
                  mobileTab === t.id ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {notice && <p className="mt-2 text-xs text-muted-foreground">{notice}</p>}
      </div>

      {/* ── Cuerpo: chat | panel ───────────────────────────────────────────── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div className={cn("min-h-0 flex-col", mobileTab === "chat" ? "flex" : "hidden", "lg:flex")}>
          <AgentChat agent={agent} refreshKey={refreshKey} onChanged={refresh} onOpenTab={openTab} />
        </div>
        <aside
          className={cn("min-h-0 flex-col bg-muted/30 lg:border-l", mobileTab === "panel" ? "flex" : "hidden", "lg:flex")}
          aria-label="Configuración y seguimiento del agente"
        >
          <AgentPanel
            agent={agent}
            extras={data}
            tab={tab}
            onTabChange={openTab}
            refreshKey={refreshKey}
            onChanged={refresh}
          />
        </aside>
      </div>
    </div>
  );
}
