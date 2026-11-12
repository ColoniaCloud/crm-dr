"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "@/components/icons";
import { fillTemplate } from "@/lib/whatsapp/message-view";
import type { InboxTemplate } from "@/lib/whatsapp/templates";
import { TemplateButtonsPreview } from "../templates/template-buttons";

/**
 * Completa y manda una plantilla aprobada. Muestra el texto como va a llegarle
 * al cliente, con las variables reemplazadas a medida que se escriben.
 */
export function TemplateDialog({
  template,
  sending,
  error,
  onClose,
  onSend,
}: {
  template: InboxTemplate | null;
  sending: boolean;
  error: string | null;
  onClose: () => void;
  onSend: (template: InboxTemplate, params: string[]) => void;
}) {
  const [params, setParams] = useState<string[]>([]);

  // Al abrir otra plantilla se vacían las variables.
  useEffect(() => {
    setParams(template ? Array.from({ length: template.variableCount }, () => "") : []);
  }, [template]);

  const preview = useMemo(() => (template ? fillTemplate(template.body, params) : ""), [template, params]);
  const complete = params.every((p) => p.trim().length > 0);

  return (
    <Dialog open={Boolean(template)} onOpenChange={(open) => !open && !sending && onClose()}>
      <DialogContent className="max-w-md">
        {template && (
          <>
            <DialogHeader>
              <DialogTitle>{template.name}</DialogTitle>
              <DialogDescription>
                {template.variableCount
                  ? "Completá las variables. Así le va a llegar:"
                  : "Esta plantilla no tiene variables. Así le va a llegar:"}
              </DialogDescription>
            </DialogHeader>

            <div className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">
              {template.header && <p className="mb-1 font-semibold">{template.header}</p>}
              {preview}
              {template.footer && <p className="mt-2 text-xs text-muted-foreground">{template.footer}</p>}
            </div>
            <TemplateButtonsPreview buttons={template.buttons} />

            {template.variableCount > 0 && (
              <div className="space-y-3">
                {params.map((value, i) => (
                  <div key={i} className="space-y-1">
                    <Label htmlFor={`wa-var-${i}`}>Variable {`{{${i + 1}}}`}</Label>
                    <Input
                      id={`wa-var-${i}`}
                      value={value}
                      maxLength={1000}
                      onChange={(e) => setParams((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
                    />
                  </div>
                ))}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={sending}>
                Cancelar
              </Button>
              <Button onClick={() => onSend(template, params)} disabled={!complete || sending}>
                {sending ? <Loader2 className="animate-spin" /> : <Send />}
                Enviar plantilla
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
