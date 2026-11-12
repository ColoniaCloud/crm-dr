import { ExternalLink, Phone } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { TemplateButtonView } from "@/lib/whatsapp/template-rules";

/**
 * Los botones de una plantilla, como se ven debajo del mensaje en WhatsApp: uno
 * por renglón, con el ícono de lo que hacen (abrir un link, llamar). Las
 * respuestas rápidas no llevan ícono, igual que en WhatsApp.
 *
 * Es solo para mirar: acá no se toca nada.
 */
export function TemplateButtonsPreview({
  buttons,
  className,
}: {
  buttons: TemplateButtonView[] | undefined;
  className?: string;
}) {
  if (!buttons?.length) return null;

  return (
    <ul className={cn("space-y-1", className)} aria-label="Botones de la plantilla">
      {buttons.map((b, i) => (
        <li
          key={`${b.type}-${i}`}
          className="flex items-center justify-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium text-primary"
          title={b.url ?? (b.phone ? `+${b.phone.replace(/\D/g, "")}` : undefined)}
        >
          {b.type === "URL" && <ExternalLink className="size-3.5 shrink-0" aria-hidden />}
          {(b.type === "PHONE_NUMBER" || b.type === "VOICE_CALL") && <Phone className="size-3.5 shrink-0" aria-hidden />}
          <span className="truncate">{b.text || "Botón"}</span>
        </li>
      ))}
    </ul>
  );
}
