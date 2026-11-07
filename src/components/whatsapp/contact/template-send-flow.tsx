"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Loader2, MessageCircle } from "@/components/icons";
import type { InboxTemplate } from "@/lib/whatsapp/templates";
import { TemplateDialog } from "../inbox/template-dialog";
import { sendTemplateTo } from "./send-template";

/**
 * "Enviar plantilla" a un número, en tres pasos: elegir una de las aprobadas,
 * completar sus variables y confirmar que salió (con atajo al chat en la bandeja).
 */
export function TemplateSendFlow({
  peer,
  name,
  onClose,
}: {
  /** Número ya normalizado (solo dígitos con código de país). */
  peer: string;
  name?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<InboxTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<InboxTemplate | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/whatsapp/templates", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar las plantillas");
        if (!cancelled) setTemplates(data.templates ?? []);
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : "Error"));
    return () => {
      cancelled = true;
    };
  }, []);

  const send = async (t: InboxTemplate, params: string[]) => {
    setSending(true);
    setSendError(null);
    const result = await sendTemplateTo(peer, t, params);
    setSending(false);
    if (result.ok) {
      setPicked(null);
      setDone(t.name);
    } else {
      setSendError(result.error);
    }
  };

  if (picked) {
    return (
      <TemplateDialog
        template={picked}
        sending={sending}
        error={sendError}
        onClose={() => {
          setPicked(null);
          setSendError(null);
        }}
        onSend={send}
      />
    );
  }

  if (done) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Plantilla enviada</DialogTitle>
            <DialogDescription>
              Mandaste «{done}»{name ? ` a ${name}` : ""}. Si responde, la conversación sigue en la bandeja.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
            <Button
              onClick={() => {
                onClose();
                router.push(`/whatsapp?c=${peer}`);
              }}
            >
              <MessageCircle />
              Abrir en el Inbox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar plantilla</DialogTitle>
          <DialogDescription>
            Elegí una plantilla aprobada{name ? ` para ${name}` : ""}. Es la única forma de escribirle primero a alguien.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {!templates && !loadError && (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="animate-spin" /> Cargando plantillas…
            </p>
          )}
          {loadError && <p className="py-6 text-sm text-destructive">{loadError}</p>}
          {templates?.length === 0 && (
            <p className="py-6 text-sm text-muted-foreground">No hay plantillas aprobadas todavía.</p>
          )}
          {templates?.map((t) => (
            <button
              key={`${t.name}|${t.language}`}
              type="button"
              disabled={Boolean(t.unsupported)}
              onClick={() => setPicked(t)}
              className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                <FileText className="size-4 shrink-0" />
                <span className="truncate">{t.name}</span>
                <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">{t.language}</span>
              </p>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                {t.unsupported ? `No se puede mandar desde acá: ${t.unsupported}` : t.body}
              </p>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
