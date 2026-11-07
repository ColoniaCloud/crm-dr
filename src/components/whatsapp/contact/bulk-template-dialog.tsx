"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Loader2, Send } from "@/components/icons";
import {
  BULK_CHUNK,
  BULK_MAX,
  BULK_MAX_CONSECUTIVE_FAILURES,
  chunk,
  dedupeByPeer,
  resolveParams,
  tally,
  variablesComplete,
  type BulkOutcome,
  type VariableSource,
} from "@/lib/whatsapp/bulk-rules";
import { fillTemplate } from "@/lib/whatsapp/message-view";
import { looksLikeWaNumber, peerKey } from "@/lib/whatsapp/peer";
import type { InboxTemplate } from "@/lib/whatsapp/templates";

export type BulkTarget = {
  /** Identifica al destinatario en la lista de la pantalla (para marcarlo después). */
  id: string;
  name: string;
  /** Número de WhatsApp, con código de país. */
  number: string;
  /** La ficha ya figura como contactada (se puede omitir). */
  contacted?: boolean;
};

type Props = {
  targets: BulkTarget[];
  /** Se llama una vez al terminar con los ids a los que la plantilla salió, o ya tenían conversación. */
  onFinished?: (reached: string[]) => void;
  onClose: () => void;
};

type Phase =
  | { kind: "pick" }
  | { kind: "configure"; template: InboxTemplate }
  | { kind: "sending"; template: InboxTemplate }
  | { kind: "done"; template: InboxTemplate; stopped: string | null };

/**
 * Manda una plantilla aprobada a muchos contactos de una vez: elegir plantilla,
 * decidir qué hacer con las variables y con quienes ya tienen conversación,
 * revisar cuántos van a recibirla y enviar viendo el avance.
 */
export function BulkTemplateDialog({ targets, onFinished, onClose }: Props) {
  const [templates, setTemplates] = useState<InboxTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });

  const [sources, setSources] = useState<VariableSource[]>([]);
  const [skipExisting, setSkipExisting] = useState(true);
  const [skipContacted, setSkipContacted] = useState(true);

  const [outcomes, setOutcomes] = useState<BulkOutcome[]>([]);
  const [total, setTotal] = useState(0);
  const cancelRef = useRef(false);

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

  // A quién le toca: números válidos, sin repetidos y, si se pide, sin los ya contactados.
  const plan = useMemo(() => {
    const withPeer = targets.map((t) => ({ ...t, peer: peerKey(t.number) }));
    const valid = withPeer.filter((t) => looksLikeWaNumber(t.peer));
    const invalid = withPeer.length - valid.length;
    const { unique, duplicates } = dedupeByPeer(valid);
    const contacted = unique.filter((t) => t.contacted).length;
    const recipients = skipContacted ? unique.filter((t) => !t.contacted) : unique;
    return { recipients, invalid, duplicates, contacted };
  }, [targets, skipContacted]);

  const overLimit = plan.recipients.length > BULK_MAX;
  const sending = phase.kind === "sending";

  function pick(template: InboxTemplate) {
    setSources(Array.from({ length: template.variableCount }, () => ({ kind: "name" as const })));
    setPhase({ kind: "configure", template });
  }

  async function run(template: InboxTemplate) {
    cancelRef.current = false;
    setOutcomes([]);
    setTotal(plan.recipients.length);
    setPhase({ kind: "sending", template });

    const acc: BulkOutcome[] = [];
    let consecutiveFailures = 0;
    let stopped: string | null = null;

    for (const batch of chunk(plan.recipients, BULK_CHUNK)) {
      if (cancelRef.current) {
        stopped = "Lo cortaste vos. Los que faltaban no se enviaron.";
        break;
      }

      let batchOutcomes: BulkOutcome[];
      try {
        const res = await fetch("/api/whatsapp/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: { name: template.name, language: template.language },
            skipExisting,
            recipients: batch.map((r) => ({
              peer: r.peer,
              name: r.name,
              params: resolveParams(sources, r.name),
            })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "No se pudo completar el envío");
        batchOutcomes = data.outcomes as BulkOutcome[];
      } catch (e) {
        const message = e instanceof Error ? e.message : "No se pudo completar el envío";
        batchOutcomes = batch.map((r) => ({ peer: r.peer, status: "failed" as const, error: message }));
      }

      acc.push(...batchOutcomes);
      setOutcomes([...acc]);

      for (const o of batchOutcomes) consecutiveFailures = o.status === "failed" ? consecutiveFailures + 1 : 0;
      if (consecutiveFailures >= BULK_MAX_CONSECUTIVE_FAILURES) {
        stopped = "Se cortó solo: fallaron varios envíos seguidos. Revisá el motivo antes de reintentar.";
        break;
      }
    }

    const reachedPeers = new Set(acc.filter((o) => o.status !== "failed").map((o) => o.peer));
    onFinished?.(plan.recipients.filter((r) => reachedPeers.has(r.peer)).map((r) => r.id));
    setPhase({ kind: "done", template, stopped });
  }

  const counts = tally(outcomes);
  const done = outcomes.length;
  const nameByPeer = useMemo(() => new Map(plan.recipients.map((r) => [r.peer, r.name])), [plan.recipients]);
  const failures = outcomes.filter((o): o is Extract<BulkOutcome, { status: "failed" }> => o.status === "failed");

  const previewTarget = plan.recipients[0];
  const preview =
    phase.kind === "configure"
      ? fillTemplate(phase.template.body, resolveParams(sources, previewTarget?.name ?? ""))
      : "";

  return (
    <Dialog open onOpenChange={(open) => !open && !sending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar plantilla a {targets.length} contactos</DialogTitle>
          <DialogDescription>
            {phase.kind === "pick" && "Elegí una plantilla aprobada. Es la única forma de escribirle primero a alguien."}
            {phase.kind === "configure" && "Revisá a quiénes les va a llegar antes de enviar."}
            {phase.kind === "sending" && "Enviando. No cierres esta ventana hasta que termine."}
            {phase.kind === "done" && "Terminó el envío."}
          </DialogDescription>
        </DialogHeader>

        {phase.kind === "pick" && (
          <>
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
                  onClick={() => pick(t)}
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
          </>
        )}

        {phase.kind === "configure" && (
          <>
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">
              {phase.template.header && <p className="mb-1 font-semibold">{phase.template.header}</p>}
              {preview}
              {phase.template.footer && <p className="mt-2 text-xs text-muted-foreground">{phase.template.footer}</p>}
            </div>

            {sources.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Cada variable puede llevar el nombre de cada contacto o un texto igual para todos. La vista previa usa
                  al primero{previewTarget ? ` (${previewTarget.name})` : ""}.
                </p>
                {sources.map((source, i) => (
                  <div key={i} className="space-y-1">
                    <Label htmlFor={`bulk-var-${i}`}>Variable {`{{${i + 1}}}`}</Label>
                    <div className="flex gap-2">
                      <label className="flex shrink-0 items-center gap-2 text-sm">
                        <Checkbox
                          checked={source.kind === "name"}
                          onCheckedChange={(v) =>
                            setSources((prev) =>
                              prev.map((s, j) => (j === i ? (v ? { kind: "name" } : { kind: "text", value: "" }) : s))
                            )
                          }
                        />
                        Nombre
                      </label>
                      <Input
                        id={`bulk-var-${i}`}
                        value={source.kind === "text" ? source.value : ""}
                        placeholder={source.kind === "name" ? "El nombre de cada contacto" : "Texto para todos"}
                        disabled={source.kind === "name"}
                        maxLength={1000}
                        onChange={(e) =>
                          setSources((prev) => prev.map((s, j) => (j === i ? { kind: "text", value: e.target.value } : s)))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <label className="flex items-start gap-2">
                <Checkbox checked={skipExisting} onCheckedChange={(v) => setSkipExisting(!!v)} className="mt-0.5" />
                <span>
                  Omitir a quienes ya tienen una conversación
                  <span className="block text-xs text-muted-foreground">
                    Mandar la presentación de nuevo a quien ya la recibió es insistirle.
                  </span>
                </span>
              </label>
              {plan.contacted > 0 && (
                <label className="flex items-start gap-2">
                  <Checkbox checked={skipContacted} onCheckedChange={(v) => setSkipContacted(!!v)} className="mt-0.5" />
                  <span>
                    Omitir los marcados como contactados ({plan.contacted})
                  </span>
                </label>
              )}
            </div>

            <div className="rounded-lg bg-muted px-3 py-2 text-sm">
              <p className="font-medium">
                Se enviará a {plan.recipients.length} {plan.recipients.length === 1 ? "contacto" : "contactos"}
              </p>
              {(plan.duplicates > 0 || plan.invalid > 0) && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {plan.duplicates > 0 && `${plan.duplicates} repetidos (mismo número) se cuentan una sola vez. `}
                  {plan.invalid > 0 && `${plan.invalid} sin un número de WhatsApp válido se descartan.`}
                </p>
              )}
              {skipExisting && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Quienes ya tengan conversación se descuentan al enviar.
                </p>
              )}
              {overLimit && (
                <p className="mt-1 text-xs text-destructive">
                  Son más de {BULK_MAX}. Elegí menos contactos por tanda.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setPhase({ kind: "pick" })}>
                Cambiar plantilla
              </Button>
              <Button
                onClick={() => void run(phase.template)}
                disabled={plan.recipients.length === 0 || overLimit || !variablesComplete(sources)}
              >
                <Send />
                Enviar a {plan.recipients.length}
              </Button>
            </DialogFooter>
          </>
        )}

        {(phase.kind === "sending" || phase.kind === "done") && (
          <>
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }}
                />
              </div>
              <p className="text-sm">
                {done} de {total} procesados · <span className="text-green-600">{counts.sent} enviados</span>
                {counts.skipped > 0 && <> · {counts.skipped} omitidos (ya tenían conversación)</>}
                {counts.failed > 0 && <> · <span className="text-destructive">{counts.failed} con error</span></>}
              </p>
              {phase.kind === "done" && phase.stopped && (
                <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                  {phase.stopped}
                </p>
              )}
            </div>

            {failures.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2 text-xs">
                {failures.map((f) => (
                  <p key={f.peer}>
                    <span className="font-medium">{nameByPeer.get(f.peer) ?? f.peer}</span>
                    <span className="text-muted-foreground"> · {f.error}</span>
                  </p>
                ))}
              </div>
            )}

            <DialogFooter>
              {phase.kind === "sending" ? (
                <Button variant="outline" onClick={() => (cancelRef.current = true)}>
                  <Loader2 className="animate-spin" />
                  Cortar después de este lote
                </Button>
              ) : (
                <Button onClick={onClose}>Cerrar</Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
