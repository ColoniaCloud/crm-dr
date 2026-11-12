"use client";

import { Check, CheckCheck, Clock, AlertTriangle, FileText, MapPin } from "@/components/icons";
import { cn } from "@/lib/utils";
import { fillTemplate } from "@/lib/whatsapp/message-view";
import type { ThreadMessage } from "@/lib/whatsapp/inbox";
import type { InboxTemplate } from "@/lib/whatsapp/templates";
import { TemplateButtonsPreview } from "../templates/template-buttons";

/** El archivo se pide con el mensaje en el que vino: el servidor comprueba con eso de qué bandeja es. */
const mediaUrl = (id: string, messageId: string) =>
  `/api/whatsapp/media/${encodeURIComponent(id)}?m=${encodeURIComponent(messageId)}`;

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

/** Los tildes de un saliente: reloj → ✓ enviado → ✓✓ entregado → ✓✓ azul leído. */
function Ticks({ status }: { status: string | null }) {
  if (status === "failed") return <AlertTriangle className="size-3.5 text-destructive" aria-label="No se pudo enviar" />;
  if (status === "read") return <CheckCheck className="size-3.5 text-sky-500" aria-label="Leído" />;
  if (status === "delivered") return <CheckCheck className="size-3.5" aria-label="Entregado" />;
  if (status === "sent") return <Check className="size-3.5" aria-label="Enviado" />;
  return <Clock className="size-3.5" aria-label="Pendiente" />;
}

export function MessageBubble({ message, templates }: { message: ThreadMessage; templates: InboxTemplate[] }) {
  const out = message.direction === "outbound";

  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[70%]",
          out ? "rounded-br-sm bg-primary/10" : "rounded-bl-sm bg-muted"
        )}
      >
        <Body view={message.view} messageId={message.id} templates={templates} />

        {message.status === "failed" && (
          <p className="mt-1 text-xs text-destructive">{message.error ?? "No se pudo enviar"}</p>
        )}

        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
          <span>{time(message.timestamp)}</span>
          {out && <Ticks status={message.status} />}
        </div>
      </div>
    </div>
  );
}

function Body({
  view: v,
  messageId,
  templates,
}: {
  view: ThreadMessage["view"];
  messageId: string;
  templates: InboxTemplate[];
}) {
  switch (v.kind) {
    case "text":
      return <p className="whitespace-pre-wrap break-words">{v.text}</p>;

    case "media":
      return (
        <div className="space-y-1">
          {(v.media === "image" || v.media === "sticker") && (
            <a href={mediaUrl(v.id, messageId)} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(v.id, messageId)}
                alt={v.caption ?? "Imagen"}
                loading="lazy"
                className={cn("rounded-lg", v.media === "sticker" ? "size-28" : "max-h-72 w-auto")}
              />
            </a>
          )}
          {v.media === "audio" && <audio controls preload="none" src={mediaUrl(v.id, messageId)} className="max-w-full" />}
          {v.media === "video" && (
            <video controls preload="none" src={mediaUrl(v.id, messageId)} className="max-h-72 max-w-full rounded-lg" />
          )}
          {v.media === "document" && (
            <a
              href={mediaUrl(v.id, messageId)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 hover:bg-background"
            >
              <FileText className="size-5 shrink-0" />
              <span className="truncate">{v.filename ?? "Documento"}</span>
            </a>
          )}
          {v.caption && <p className="whitespace-pre-wrap break-words">{v.caption}</p>}
        </div>
      );

    case "location":
      return (
        <a
          href={`https://www.google.com/maps?q=${v.latitude},${v.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 underline underline-offset-2"
        >
          <MapPin className="size-4 shrink-0" />
          <span>{v.name ?? v.address ?? "Ubicación"}</span>
        </a>
      );

    case "template": {
      const t = templates.find((x) => x.name === v.name && (!v.language || x.language === v.language));
      const text = t ? fillTemplate(t.body, v.params) : v.params.filter(Boolean).join(" · ");
      return (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Plantilla · {v.name}
          </p>
          {text && <p className="whitespace-pre-wrap break-words">{text}</p>}
          <TemplateButtonsPreview buttons={t?.buttons} />
        </div>
      );
    }

    case "reaction":
      return <p className="italic">{v.emoji ? `Reaccionó con ${v.emoji}` : "Quitó su reacción"}</p>;

    case "reply":
      return <p className="italic">↩ {v.text}</p>;

    case "other":
      return <p className="italic text-muted-foreground">{v.label}</p>;
  }
}
