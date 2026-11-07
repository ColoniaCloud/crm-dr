"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink, FileText, MessageCircle } from "@/components/icons";
import { formatWaNumber, peerKey } from "@/lib/whatsapp/peer";
import { isPlausibleWhatsappNumber, normalizeWhatsappNumber, type WaCountry } from "@/lib/whatsapp/phone";
import { TemplateSendFlow } from "./template-send-flow";

/**
 * El número de WhatsApp de un contacto, como botón: en vez de abrir `wa.me`
 * directo abre un modal con las tres cosas que se pueden hacer —mandar una
 * plantilla, abrir WhatsApp Web, o seguir en la bandeja del CRM—.
 *
 *   <WhatsAppTrigger number={lead.whatsapp} name="Laura Gómez">…</WhatsAppTrigger>
 *
 * Los `children` son lo que se ve (un ícono, el número, ...). El modal se monta
 * recién al hacer clic, así que una lista con cientos de filas no carga nada.
 */
export function WhatsAppTrigger({
  number,
  country,
  name,
  className,
  title = "WhatsApp",
  children,
}: {
  number: string;
  country?: WaCountry;
  name?: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        title={title}
        onClick={(e) => {
          // Dentro de filas y tarjetas clickeables: que no se abra también la ficha.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {children}
      </button>
      {open && <WhatsAppContactDialog number={number} country={country} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

/** El modal en sí, para usarlo desde un menú (ver `installers/page.tsx`). */
export function WhatsAppContactDialog({
  number,
  country,
  name,
  onClose,
}: {
  number: string;
  country?: WaCountry;
  name?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [templateFlow, setTemplateFlow] = useState(false);

  const normalized = normalizeWhatsappNumber(number, country);
  const valid = isPlausibleWhatsappNumber(normalized);
  const peer = peerKey(normalized);

  if (templateFlow) return <TemplateSendFlow peer={peer} name={name} onClose={onClose} />;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{name || "WhatsApp"}</DialogTitle>
          <DialogDescription>{valid ? formatWaNumber(normalized) : number}</DialogDescription>
        </DialogHeader>

        {!valid ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Este número no parece válido para WhatsApp ({number}). Revisalo en la ficha: tiene que incluir el código de
            país o ser un número local completo.
          </p>
        ) : (
          <div className="space-y-2">
            <Option
              icon={<FileText className="size-5" />}
              title="Enviar plantilla"
              hint="Elegí una plantilla aprobada y mandásela."
              onClick={() => setTemplateFlow(true)}
            />
            <Option
              icon={<ExternalLink className="size-5" />}
              title="Abrir en WhatsApp Web"
              hint="Se abre el chat en web.whatsapp.com."
              onClick={() => {
                window.open(`https://web.whatsapp.com/send?phone=${normalized}`, "_blank", "noopener,noreferrer");
                onClose();
              }}
            />
            <Option
              icon={<MessageCircle className="size-5" />}
              title="Abrir en Inbox del CRM"
              hint="Ver y seguir la conversación en la bandeja."
              onClick={() => {
                onClose();
                router.push(`/whatsapp?c=${peer}`);
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Option({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60"
    >
      <span className="text-whatsapp">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
