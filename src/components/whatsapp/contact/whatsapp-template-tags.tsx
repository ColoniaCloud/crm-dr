"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { ContactTemplateTag } from "@/lib/whatsapp/template-tags";

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Las etiquetas de WhatsApp de una ficha: el nombre de cada plantilla que se le
 * mandó. Se agregan solas al mandar la plantilla (ver
 * `lib/whatsapp/template-tags.ts`), así que acá no se editan: solo se muestran,
 * con la fecha del último envío y cuántas veces se mandó.
 */
export function WhatsappTemplateTags({ contactId }: { contactId: string }) {
  const [tags, setTags] = useState<ContactTemplateTag[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/contacts/${encodeURIComponent(contactId)}/whatsapp-templates`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { templates: ContactTemplateTag[] };
        if (!cancelled) setTags(data.templates);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  return (
    <div className="py-3 border-b">
      <span className="text-muted-foreground font-medium block mb-2">Etiquetas de WhatsApp</span>
      <div className="flex flex-wrap gap-1.5">
        {error && <span className="text-xs text-destructive">No se pudieron cargar</span>}
        {!error && tags === null && <span className="text-xs text-muted-foreground">Cargando…</span>}
        {tags?.length === 0 && <span className="text-xs text-muted-foreground">Todavía no se le mandó ninguna plantilla</span>}
        {tags?.map((t) => {
          const detail = `Último envío: ${fecha(t.lastSentAt)}${t.count > 1 ? ` · ${t.count} envíos` : ""}`;
          return (
            <Badge
              key={t.name}
              variant="secondary"
              className="gap-1 font-mono text-[11px]"
              title={detail}
              aria-label={`${t.name}. ${detail}`}
            >
              {t.name}
              {t.count > 1 && <span className="font-sans text-muted-foreground">×{t.count}</span>}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
