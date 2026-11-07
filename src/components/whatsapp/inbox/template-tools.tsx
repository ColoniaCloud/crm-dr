"use client";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText } from "@/components/icons";
import type { InboxTemplate } from "@/lib/whatsapp/templates";

/**
 * Las plantillas aprobadas como herramientas del chat.
 *
 * En pantalla ancha es una barra de botones (una por plantilla); en el celular
 * un desplegable, que ocupa una sola línea en vez de empujar el chat hacia
 * arriba. Las que no se pueden mandar desde acá (encabezado con imagen, botones
 * con link variable) se muestran apagadas y con el motivo.
 */
export function TemplateTools({
  templates,
  loading,
  error,
  highlight,
  onPick,
}: {
  templates: InboxTemplate[];
  loading: boolean;
  error: string | null;
  /** Fuera de la ventana de 24 h las plantillas son lo único que se puede mandar. */
  highlight: boolean;
  onPick: (template: InboxTemplate) => void;
}) {
  if (loading) return <p className="px-1 text-xs text-muted-foreground">Cargando plantillas…</p>;
  if (error) return <p className="px-1 text-xs text-destructive">{error}</p>;
  if (templates.length === 0) {
    return <p className="px-1 text-xs text-muted-foreground">No hay plantillas aprobadas todavía.</p>;
  }

  const key = (t: InboxTemplate) => `${t.name}|${t.language}`;

  return (
    <>
      {/* Escritorio: barra de botones */}
      <div className="hidden items-center gap-2 overflow-x-auto pb-1 md:flex" role="toolbar" aria-label="Plantillas">
        <span className="shrink-0 text-xs text-muted-foreground">Plantillas:</span>
        {templates.map((t) => (
          <Button
            key={key(t)}
            type="button"
            size="sm"
            variant={highlight ? "default" : "outline"}
            className="shrink-0"
            disabled={Boolean(t.unsupported)}
            title={t.unsupported ?? t.body}
            onClick={() => onPick(t)}
          >
            <FileText />
            {t.name}
          </Button>
        ))}
      </div>

      {/* Celular: desplegable */}
      <div className="md:hidden">
        <Select
          value=""
          onValueChange={(v) => {
            const t = templates.find((x) => key(x) === v);
            if (t) onPick(t);
          }}
        >
          <SelectTrigger aria-label="Plantillas" className={highlight ? "border-primary" : undefined}>
            <SelectValue placeholder="Plantillas…" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={key(t)} value={key(t)} disabled={Boolean(t.unsupported)}>
                {t.name}
                {t.unsupported ? ` — ${t.unsupported}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
