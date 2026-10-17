"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, Check, FileDown, Inbox, Loader2, Mail, Play, Send, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatInput, ChatInputSubmit, ChatInputTextArea } from "@/components/ui/chat-input";
import { cn } from "@/lib/utils";
import { apiJson, formatDateTimeAR, type AgentDTO, type AgentMessageDTO, type ChatCard } from "@/components/agents/types";

const SUGERENCIAS: Record<string, string[]> = {
  COLLECTIONS: [
    "¿Qué hiciste en la última ronda?",
    "¿Quiénes tienen pagos vencidos?",
    "¿Qué quedó pendiente de aprobación?",
    "Armame el reporte de este mes",
  ],
  LEAD_PRIORITIZER: [
    "¿Cómo vienen las listas de hoy?",
    "¿Cómo salieron los contactos esta semana?",
    "¿Qué viene en la cola?",
    "Poné los talleres de Mendoza más arriba",
  ],
};

/** Negritas `**así**` y saltos de línea; el resto, texto plano. */
function RichText({ text }: { text: string }) {
  const partes = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="whitespace-pre-wrap break-words">
      {partes.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>
      )}
    </p>
  );
}

export function AgentChat({
  agent,
  refreshKey,
  onChanged,
  onOpenTab,
}: {
  agent: AgentDTO;
  refreshKey: number;
  onChanged: () => void;
  onOpenTab: (tab: string) => void;
}) {
  const [messages, setMessages] = useState<AgentMessageDTO[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    apiJson<{ messages: AgentMessageDTO[] }>(`/api/agents/${agent.id}/chat`)
      .then((d) => setMessages(d.messages))
      .catch((e: Error) => setError(e.message));
  }, [agent.id]);

  useEffect(load, [load, refreshKey]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || sending) return;
    setInput("");
    setError(null);
    setSending(true);
    setMessages((prev) => [
      ...(prev ?? []),
      { id: `tmp-${Date.now()}`, role: "USER", userName: "Vos", content: msg, attachments: null, createdAt: new Date().toISOString() },
    ]);
    try {
      await apiJson(`/api/agents/${agent.id}/chat`, { method: "POST", body: JSON.stringify({ message: msg }) });
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const vacio = messages !== null && messages.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {messages === null && !error && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando conversación…
          </div>
        )}

        {vacio && (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium">Hablá con {agent.name}</p>
              <p className="text-sm text-muted-foreground">
                Preguntale qué hizo, cómo salieron las rondas o pedile un reporte. Lo que implique mandar o cambiar algo te lo
                va a dejar con un botón para confirmar.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {(SUGERENCIAS[agent.kind] ?? SUGERENCIAS.COLLECTIONS).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-2xl space-y-4">
          {messages?.map((m) => (
            <div key={m.id} className={cn("flex gap-2.5", m.role === "USER" ? "justify-end" : "justify-start")}>
              {m.role === "ASSISTANT" && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={cn("max-w-[85%] space-y-2", m.role === "USER" && "items-end")}>
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2.5 text-sm",
                    m.role === "USER" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border bg-card"
                  )}
                >
                  <RichText text={m.content} />
                </div>
                {m.attachments?.map((c, i) => (
                  <CardView key={i} card={c} agent={agent} onChanged={() => { load(); onChanged(); }} onOpenTab={onOpenTab} />
                ))}
                <p className={cn("px-1 text-[10px] text-muted-foreground", m.role === "USER" && "text-right")}>
                  {m.role === "USER" && m.userName ? `${m.userName} · ` : ""}
                  {formatDateTimeAR(m.createdAt)}
                </p>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {agent.name} está revisando…
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t bg-background/80 px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <ChatInput value={input} onChange={setInput} onSubmit={() => send(input)} loading={sending}>
            <ChatInputTextArea placeholder={`Escribile a ${agent.name}… (Enter para enviar)`} />
            <div className="flex w-full items-center justify-between pt-1.5">
              <span className="text-[11px] text-muted-foreground">Chat compartido con el equipo</span>
              <ChatInputSubmit />
            </div>
          </ChatInput>
        </div>
      </div>
    </div>
  );
}

function CardShell({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-muted/40 p-3 text-sm">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

/**
 * Las tarjetas son la única forma en que el chat produce efectos: cada botón le
 * pega a su propio endpoint, que vuelve a chequear el permiso.
 */
function CardView({
  card,
  agent,
  onChanged,
  onOpenTab,
}: {
  card: ChatCard;
  agent: AgentDTO;
  onChanged: () => void;
  onOpenTab: (tab: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(fn: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      setDone(await fn());
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const sinPermiso = (
    <p className="mt-2 text-xs text-muted-foreground">Esto lo confirma un SUPERADMIN.</p>
  );
  const pie = (
    <>
      {done && <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" />{done}</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </>
  );

  switch (card.type) {
    case "action_created":
      return (
        <CardShell icon={<Mail className="h-3.5 w-3.5" />} title="Borrador de mail">
          <p className="font-medium">{card.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">Asunto: {card.subject}</p>
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-primary">Ver texto</summary>
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-background p-2 text-xs">{card.body}</p>
          </details>
          {agent.permissions.approve && !done ? (
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const r = await apiJson<{ result: Record<string, number> }>(`/api/agents/${agent.id}/actions`, {
                      method: "POST",
                      body: JSON.stringify({ op: "approve", ids: [card.actionId] }),
                    });
                    if (r.result.SENT) return "Enviado.";
                    if (r.result.DISCARDED) return "No se mandó: la venta ya no tiene saldo o hay un pago declarado.";
                    if (r.result.FAILED) throw new Error("El envío falló. Mirá el detalle en Pendientes.");
                    return "Ya se había procesado.";
                  })
                }
              >
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                Enviar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await apiJson(`/api/agents/${agent.id}/actions`, {
                      method: "POST",
                      body: JSON.stringify({ op: "discard", ids: [card.actionId] }),
                    });
                    return "Descartado.";
                  })
                }
              >
                Descartar
              </Button>
            </div>
          ) : !agent.permissions.approve ? (
            sinPermiso
          ) : null}
          {pie}
        </CardShell>
      );

    case "confirm_actions":
      return (
        <CardShell
          icon={card.op === "approve" ? <Send className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
          title={card.op === "approve" ? "Aprobar envíos" : "Descartar envíos"}
        >
          <ul className="list-disc space-y-0.5 pl-4 text-xs">
            {card.items.slice(0, 15).map((it, i) => <li key={i}>{it}</li>)}
            {card.items.length > 15 && <li>y {card.items.length - 15} más</li>}
          </ul>
          {agent.permissions.approve && !done ? (
            <Button
              size="sm"
              className="mt-2"
              variant={card.op === "approve" ? "default" : "destructive"}
              disabled={busy}
              onClick={() =>
                act(async () => {
                  if (card.op === "discard") {
                    const r = await apiJson<{ discarded: number }>(`/api/agents/${agent.id}/actions`, {
                      method: "POST",
                      body: JSON.stringify({ op: "discard", ids: card.actionIds }),
                    });
                    return `${r.discarded} descartado(s).`;
                  }
                  const r = await apiJson<{ result: Record<string, number> }>(`/api/agents/${agent.id}/actions`, {
                    method: "POST",
                    body: JSON.stringify({ op: "approve", ids: card.actionIds }),
                  });
                  if (!r.result.SENT && !r.result.FAILED && !r.result.DISCARDED) return "Ya se habían procesado.";
                  return `${r.result.SENT} enviado(s)${r.result.FAILED ? `, ${r.result.FAILED} fallaron` : ""}${r.result.DISCARDED ? `, ${r.result.DISCARDED} descartados porque ya pagaron` : ""}.`;
                })
              }
            >
              {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {card.op === "approve" ? `Aprobar y enviar ${card.actionIds.length}` : `Descartar ${card.actionIds.length}`}
            </Button>
          ) : !agent.permissions.approve ? (
            sinPermiso
          ) : null}
          {pie}
        </CardShell>
      );

    case "report":
      return (
        <CardShell icon={<FileDown className="h-3.5 w-3.5" />} title={`Reporte ${card.from} → ${card.to}`}>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/agents/${agent.id}/report?from=${card.from}&to=${card.to}&format=pdf`}>PDF</a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/agents/${agent.id}/report?from=${card.from}&to=${card.to}&format=csv`}>Excel (CSV)</a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || Boolean(done)}
              onClick={() =>
                act(async () => {
                  const r = await apiJson<{ to: string }>(`/api/agents/${agent.id}/report`, {
                    method: "POST",
                    body: JSON.stringify({ from: card.from, to: card.to }),
                  });
                  return `Enviado a ${r.to}.`;
                })
              }
            >
              <Mail className="mr-1 h-3.5 w-3.5" /> Mandármelo por mail
            </Button>
          </div>
          {pie}
        </CardShell>
      );

    case "template":
      return (
        <CardShell icon={<Wand2 className="h-3.5 w-3.5" />} title={`Plantilla propuesta · ${card.stepLabel}`}>
          <p className="text-xs text-muted-foreground">Asunto: {card.subject}</p>
          <p className="mt-1 whitespace-pre-wrap rounded-md bg-background p-2 text-xs">{card.body}</p>
          {agent.permissions.configure && !done ? (
            <Button
              size="sm"
              className="mt-2"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await apiJson(`/api/agents/${agent.id}/template`, {
                    method: "POST",
                    body: JSON.stringify({ stepKey: card.stepKey, subject: card.subject, body: card.body }),
                  });
                  return "Plantilla aplicada.";
                })
              }
            >
              Aplicar plantilla
            </Button>
          ) : !agent.permissions.configure ? (
            sinPermiso
          ) : null}
          {pie}
        </CardShell>
      );

    case "run":
      return (
        <CardShell icon={<Play className="h-3.5 w-3.5" />} title="Ejecutar ronda">
          {agent.permissions.configure && !done ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await apiJson(`/api/agents/${agent.id}/run`, { method: "POST" });
                  return "Ronda terminada. El parte quedó en el chat.";
                })
              }
            >
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
              Ejecutar ahora
            </Button>
          ) : !agent.permissions.configure ? (
            sinPermiso
          ) : null}
          {pie}
        </CardShell>
      );

    case "pending_link":
      return (
        <button
          type="button"
          onClick={() => onOpenTab("pending")}
          className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300"
        >
          <Inbox className="h-3.5 w-3.5" />
          {card.count} reclamo(s) esperando aprobación
        </button>
      );

    case "config_patch":
      return (
        <CardShell icon={<Wand2 className="h-3.5 w-3.5" />} title="Cambio de configuración">
          <p>{card.description}</p>
          {agent.permissions.configure && !done ? (
            <Button
              size="sm"
              className="mt-2"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await apiJson(`/api/agents/${agent.id}/config-patch`, {
                    method: "POST",
                    body: JSON.stringify({ patch: card.patch, description: card.description }),
                  });
                  return "Cambio aplicado. Rige desde la próxima ronda.";
                })
              }
            >
              Aplicar
            </Button>
          ) : !agent.permissions.configure ? (
            sinPermiso
          ) : null}
          {pie}
        </CardShell>
      );

    case "trace":
      return null;
  }
}
