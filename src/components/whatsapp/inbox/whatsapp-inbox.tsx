"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/lib/whatsapp/inbox";
import { looksLikeWaNumber, peerKey } from "@/lib/whatsapp/peer";
import { normalizeWhatsappNumber } from "@/lib/whatsapp/phone";
import type { InboxTemplate } from "@/lib/whatsapp/templates";
import { ConversationList } from "./conversation-list";
import { ThreadView } from "./thread-view";

const POLL_MS = 10_000;

/**
 * La bandeja: lista de conversaciones a la izquierda y el chat a la derecha. En
 * el celular se ve una cosa por vez (la lista, y al elegir un chat el chat con
 * un botón para volver).
 */
export function WhatsAppInbox() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // /whatsapp?c=<número> abre ese chat directamente (lo usan los botones de WhatsApp
  // de las listas). Se lee con `useSearchParams` y no de `window.location`, porque al
  // llegar por navegación interna la URL todavía no cambió cuando la pantalla se monta.
  // Mientras no se elija otro chat a mano, manda la URL.
  const fromUrl = useSearchParams().get("c");
  const urlPeer = fromUrl && looksLikeWaNumber(peerKey(fromUrl)) ? peerKey(fromUrl) : null;
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const selected = picked === undefined ? urlPeer : picked;
  const setSelected = setPicked;

  const [templates, setTemplates] = useState<InboxTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newNumber, setNewNumber] = useState("");

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/conversations?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Error al cargar");
      setConversations(((await res.json()) as { conversations: ConversationSummary[] }).conversations);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => void loadList(), 250); // espera a que termine de escribir
    return () => clearTimeout(t);
  }, [loadList]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void loadList();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [loadList]);

  // Plantillas aprobadas (el servidor las cachea 5 minutos).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/whatsapp/templates", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar las plantillas");
        if (!cancelled) setTemplates(data.templates ?? []);
      })
      .catch((e) => !cancelled && setTemplatesError(e instanceof Error ? e.message : "Error"))
      .finally(() => !cancelled && setTemplatesLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const newPeer = peerKey(normalizeWhatsappNumber(newNumber));
  const newValid = looksLikeWaNumber(newPeer);

  return (
    <>
      <div className="grid h-[calc(100dvh-13rem)] min-h-[28rem] overflow-hidden rounded-lg border bg-card md:grid-cols-[20rem_minmax(0,1fr)]">
        <div className={cn("min-h-0 border-r", selected && "hidden md:block")}>
          <ConversationList
            conversations={conversations}
            loading={loading}
            error={error}
            selected={selected}
            query={query}
            onQuery={setQuery}
            onSelect={setSelected}
            onNew={() => setNewChatOpen(true)}
          />
        </div>

        <div className={cn("min-h-0 min-w-0", !selected && "hidden md:block")}>
          {selected ? (
            <ThreadView
              key={selected}
              peer={selected}
              templates={templates}
              templatesLoading={templatesLoading}
              templatesError={templatesError}
              onBack={() => setSelected(null)}
              onSent={() => void loadList()}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageCircle className="size-10" />
              <p className="text-sm">Elegí una conversación</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo chat</DialogTitle>
            <DialogDescription>
              Escribí el número con código de área. Para iniciar una conversación hay que usar una plantilla.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="wa-new-number">Número de WhatsApp</Label>
            <Input
              id="wa-new-number"
              inputMode="tel"
              placeholder="11 5555-1234"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewChatOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!newValid}
              onClick={() => {
                setSelected(newPeer);
                setNewChatOpen(false);
                setNewNumber("");
              }}
            >
              Abrir chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
