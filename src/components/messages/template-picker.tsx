"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { FileText } from "lucide-react";

export interface MessageTemplate {
  id: string;
  name: string;
  subject: string | null;
  body: string;
}

/**
 * Selector "Usar plantilla" — botón chico que abre la lista de mensajes
 * predeterminados de un canal (cargados desde /settings) y avisa al padre
 * cuál se eligió. El padre decide qué hacer con subject/body (Mail los usa
 * los dos, WhatsApp solo body).
 */
export function TemplatePicker({
  channel,
  onSelect,
}: {
  channel: "MAIL" | "WHATSAPP";
  onSelect: (template: MessageTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    fetch(`/api/message-templates?channel=${channel}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoaded(true));
  }, [open, loaded, channel]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 gap-1" title="Usar plantilla">
          <FileText className="h-4 w-4" />
          <span className="text-xs">Plantilla</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1" align="start">
        {!loaded ? (
          <p className="p-3 text-sm text-muted-foreground text-center">Cargando...</p>
        ) : templates.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground text-center">
            No hay plantillas — un SUPERADMIN puede cargarlas en Configuración.
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                onClick={() => {
                  onSelect(t);
                  setOpen(false);
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
