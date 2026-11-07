"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ExternalLink, Loader2, Send } from "@/components/icons";
import type { Thread } from "@/lib/whatsapp/inbox";
import type { InboxTemplate } from "@/lib/whatsapp/templates";
import { MessageBubble } from "./message-bubble";
import { TemplateDialog } from "./template-dialog";
import { TemplateTools } from "./template-tools";

const POLL_MS = 5000;

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

/**
 * Un chat: encabezado, mensajes, plantillas y caja de texto.
 *
 * Se actualiza solo cada pocos segundos mientras la pestaña está a la vista (así
 * se ven los tildes pasar de enviado a leído y los mensajes nuevos). La caja de
 * texto se apaga fuera de la ventana de 24 h, que es cuando WhatsApp solo deja
 * escribir con una plantilla.
 */
export function ThreadView({
  peer,
  templates,
  templatesLoading,
  templatesError,
  onBack,
  onSent,
}: {
  peer: string;
  templates: InboxTemplate[];
  templatesLoading: boolean;
  templatesError: string | null;
  onBack: () => void;
  onSent: () => void;
}) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [picked, setPicked] = useState<InboxTemplate | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/conversations/${encodeURIComponent(peer)}/messages`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "No se pudo cargar el chat");
      setThread((await res.json()) as Thread);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el chat");
    }
  }, [peer]);

  // Cada chat se monta de cero (el padre le pone `key={peer}`).
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Se baja al final al abrir y cuando llega algo, salvo que se esté leyendo más arriba.
  useEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [thread?.messages.length, thread?.peer]);

  const send = async (body: Record<string, unknown>): Promise<boolean> => {
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${encodeURIComponent(peer)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(data.error ?? "No se pudo enviar");
        return false;
      }
      stickToBottom.current = true;
      await load();
      onSent();
      return true;
    } catch {
      setSendError("No se pudo conectar. Probá de nuevo.");
      return false;
    } finally {
      setSending(false);
    }
  };

  const sendText = async () => {
    const value = text.trim();
    if (!value || sending) return;
    if (await send({ kind: "text", text: value })) setText("");
  };

  const sendTemplate = async (t: InboxTemplate, params: string[]) => {
    if (await send({ kind: "template", name: t.name, language: t.language, params })) setPicked(null);
  };

  const windowOpen = thread?.windowOpen ?? false;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Volver a las conversaciones">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{thread?.name ?? "Cargando…"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {thread?.number}
            {thread && (
              <>
                {" · "}
                {windowOpen ? "Ventana de 24 h abierta" : "Ventana cerrada: solo plantillas"}
              </>
            )}
          </p>
        </div>
        {thread?.contactHref && (
          <Button asChild variant="outline" size="sm">
            <Link href={thread.contactHref}>
              <ExternalLink />
              <span className="hidden sm:inline">Ver ficha</span>
            </Link>
          </Button>
        )}
      </header>

      <div
        ref={scroller}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {error && !thread && <p className="py-10 text-center text-sm text-destructive">{error}</p>}
        {!thread && !error && (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" /> Cargando…
          </p>
        )}
        {thread && thread.messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Todavía no hay mensajes con este número. Para iniciar la conversación hay que usar una plantilla.
          </p>
        )}
        {thread?.hasMore && (
          <p className="text-center text-xs text-muted-foreground">Se muestran los últimos mensajes.</p>
        )}
        {thread?.messages.map((m, i, all) => {
          const newDay = i === 0 || dayLabel(all[i - 1].timestamp) !== dayLabel(m.timestamp);
          return (
            <div key={m.id} className="space-y-2">
              {newDay && (
                <p className="text-center text-xs capitalize text-muted-foreground">{dayLabel(m.timestamp)}</p>
              )}
              <MessageBubble message={m} templates={templates} />
            </div>
          );
        })}
      </div>

      <footer className="space-y-2 border-t p-3">
        <TemplateTools
          templates={templates}
          loading={templatesLoading}
          error={templatesError}
          highlight={thread !== null && !windowOpen}
          onPick={(t) => {
            setSendError(null);
            setPicked(t);
          }}
        />

        {thread && !windowOpen ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Pasaron más de 24 horas desde el último mensaje del cliente. WhatsApp solo permite escribirle con una
            plantilla aprobada; apenas responda, vas a poder escribir libremente.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // Enter envía; Shift+Enter hace un salto de línea.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendText();
                }
              }}
              placeholder="Escribí un mensaje"
              rows={1}
              maxLength={4096}
              className="max-h-40 min-h-10 resize-none"
              disabled={!thread || sending}
            />
            <Button onClick={() => void sendText()} disabled={!text.trim() || sending || !thread} aria-label="Enviar">
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </div>
        )}

        {sendError && !picked && <p className="text-sm text-destructive">{sendError}</p>}
      </footer>

      <TemplateDialog
        template={picked}
        sending={sending}
        error={picked ? sendError : null}
        onClose={() => setPicked(null)}
        onSend={sendTemplate}
      />
    </div>
  );
}
