"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink, Loader2, MessageCircle } from "@/components/icons";
import { sendTemplateTo } from "@/components/whatsapp/contact/send-template";
import { TemplateSendFlow } from "@/components/whatsapp/contact/template-send-flow";
import { formatPeruPhone } from "@/lib/peru/phone";
import { canUseWhatsApp } from "@/lib/whatsapp/access";
import { peerKey } from "@/lib/whatsapp/peer";
import {
  PERU_OUTREACH_TEMPLATE,
  type TemplateRow,
  type TemplateState,
} from "@/lib/whatsapp/template-rules";

const STATE_LABEL: Record<TemplateState, string> = {
  approved: "aprobada",
  pending: "en revisión de Meta",
  rejected: "rechazada por Meta",
  paused: "pausada",
};

type Step =
  | { kind: "checking" }
  /** Nunca se le escribió: se ofrece mandar la plantilla de presentación. */
  | { kind: "confirm"; template: TemplateRow }
  /** La plantilla todavía no se puede mandar. */
  | { kind: "unavailable"; reason: string }
  | { kind: "sending"; template: TemplateRow }
  | { kind: "sent" }
  | { kind: "other-template" }
  | { kind: "error"; message: string };

/**
 * El botón de WhatsApp de la campaña de Perú.
 *
 *   - Primera vez (no hay mensajes con ese número): manda la plantilla de
 *     presentación (`PERU_OUTREACH_TEMPLATE`), previa confirmación, porque es un
 *     mensaje real a una empresa y no se puede deshacer.
 *   - Ya hay conversación (la ventana de 24 h abierta, o una anterior): abre el
 *     chat en la bandeja, donde se contesta con texto libre o se elige otra
 *     plantilla. Mandar de nuevo la presentación sería insistirle a quien ya
 *     recibió el mensaje.
 *
 * `number` son los dígitos con código de país (51987654321).
 */
export function PeruWhatsAppButton({
  number,
  name,
  onSent,
}: {
  number: string;
  name?: string;
  /** Se llama cuando la plantilla salió (por ejemplo, para marcar el contacto como contactado). */
  onSent?: () => void;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState<Step | null>(null);
  const peer = peerKey(number);

  const close = () => setStep(null);

  async function start() {
    // Sin acceso a WhatsApp del CRM (ver `access.ts`): solo se abre el chat en WhatsApp Web.
    if (!canUseWhatsApp(session?.user?.role)) {
      window.open(`https://web.whatsapp.com/send?phone=${peer}`, "_blank", "noopener,noreferrer");
      return;
    }
    setStep({ kind: "checking" });
    try {
      const [statusRes, templatesRes] = await Promise.all([
        fetch(`/api/whatsapp/peers/${peer}/status`, { cache: "no-store" }),
        fetch("/api/whatsapp/templates?all=1", { cache: "no-store" }),
      ]);
      const status = await statusRes.json().catch(() => ({}));
      if (!statusRes.ok) throw new Error(status.error ?? "No se pudo consultar el número");

      // Ya hay conversación: se sigue en la bandeja.
      if (status.hasConversation) {
        setStep(null);
        router.push(`/whatsapp?c=${peer}`);
        return;
      }

      const templatesData = await templatesRes.json().catch(() => ({}));
      if (!templatesRes.ok) throw new Error(templatesData.error ?? "No se pudieron cargar las plantillas");
      const rows: TemplateRow[] = templatesData.templates ?? [];
      const mine = rows.filter((t) => t.name === PERU_OUTREACH_TEMPLATE);
      const approved = mine.find((t) => t.state === "approved");

      if (approved) return setStep({ kind: "confirm", template: approved });

      setStep({
        kind: "unavailable",
        reason: mine.length
          ? `La plantilla de presentación está ${STATE_LABEL[mine[0].state]}: todavía no se puede mandar.`
          : "La plantilla de presentación todavía no está creada en Meta.",
      });
    } catch (e) {
      setStep({ kind: "error", message: e instanceof Error ? e.message : "Error desconocido" });
    }
  }

  async function sendIntro(template: TemplateRow) {
    setStep({ kind: "sending", template });
    const result = await sendTemplateTo(peer, template, []);
    if (result.ok) {
      setStep({ kind: "sent" });
      onSent?.();
    } else {
      setStep({ kind: "error", message: result.error });
    }
  }

  const label = formatPeruPhone(`+${number}`);

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        className="inline-flex items-center gap-1 text-green-600 hover:underline"
        title="WhatsApp: presentación o conversación"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {label}
      </button>

      {step?.kind === "other-template" && <TemplateSendFlow peer={peer} name={name} onClose={close} />}

      {step && step.kind !== "other-template" && (
        <Dialog open onOpenChange={(open) => !open && step.kind !== "sending" && close()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{name ? `WhatsApp · ${name}` : "WhatsApp"}</DialogTitle>
              <DialogDescription>{label}</DialogDescription>
            </DialogHeader>

            {step.kind === "checking" && (
              <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" /> Revisando si ya hay una conversación…
              </p>
            )}

            {(step.kind === "confirm" || step.kind === "sending") && (
              <>
                <p className="text-sm">
                  Todavía no hay mensajes con este número. Se le va a mandar la plantilla de presentación:
                </p>
                <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">
                  {step.template.body}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={close} disabled={step.kind === "sending"}>
                    Cancelar
                  </Button>
                  <Button onClick={() => void sendIntro(step.template)} disabled={step.kind === "sending"}>
                    {step.kind === "sending" ? <Loader2 className="animate-spin" /> : <MessageCircle />}
                    Enviar presentación
                  </Button>
                </DialogFooter>
              </>
            )}

            {step.kind === "unavailable" && (
              <>
                <p className="rounded-md bg-muted px-3 py-2 text-sm">{step.reason}</p>
                <DialogFooter className="gap-2 sm:gap-2">
                  <Button variant="outline" onClick={close}>
                    Cerrar
                  </Button>
                  <Button variant="outline" onClick={() => setStep({ kind: "other-template" })}>
                    Elegir otra plantilla
                  </Button>
                  <Button
                    onClick={() => {
                      window.open(`https://web.whatsapp.com/send?phone=${peer}`, "_blank", "noopener,noreferrer");
                      close();
                    }}
                  >
                    <ExternalLink />
                    WhatsApp Web
                  </Button>
                </DialogFooter>
              </>
            )}

            {step.kind === "sent" && (
              <>
                <p className="text-sm">
                  Plantilla enviada. Cuando responda, la conversación aparece en la bandeja y se puede seguir escribiendo.
                </p>
                <DialogFooter>
                  <Button variant="outline" onClick={close}>
                    Cerrar
                  </Button>
                  <Button
                    onClick={() => {
                      close();
                      router.push(`/whatsapp?c=${peer}`);
                    }}
                  >
                    <MessageCircle />
                    Abrir en el Inbox
                  </Button>
                </DialogFooter>
              </>
            )}

            {step.kind === "error" && (
              <>
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{step.message}</p>
                <DialogFooter>
                  <Button variant="outline" onClick={close}>
                    Cerrar
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
