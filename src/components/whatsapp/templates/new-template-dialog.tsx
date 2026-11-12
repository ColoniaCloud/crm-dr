"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Send } from "@/components/icons";
import { withLine } from "@/lib/whatsapp/line-url";
import { fillTemplate } from "@/lib/whatsapp/message-view";
import {
  TEMPLATE_LANGUAGES,
  validateNewTemplate,
  type NewTemplateInput,
} from "@/lib/whatsapp/template-rules";

const CATEGORIES: { value: NewTemplateInput["category"]; label: string; hint: string }[] = [
  {
    value: "UTILITY",
    label: "Utilidad",
    hint: "Avisos sobre algo que la persona pidió o una operación suya (un turno, un pedido, un comprobante). Sin promoción.",
  },
  {
    value: "MARKETING",
    label: "Marketing",
    hint: "Presentaciones, promociones, ofertas o campañas. Ante la duda, es Marketing: Meta la reclasifica si no coincide.",
  },
];

const variableCountOf = (body: string): number => {
  const nums = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
};

/**
 * Crea una plantilla y la manda a revisión de Meta. Valida las reglas de formato
 * antes de enviar (las mismas que valida el servidor) para no recibir un rechazo
 * críptico, y muestra el mensaje como va a verse, con los ejemplos puestos.
 */
export function NewTemplateDialog({
  line,
  lineLabel,
  onClose,
  onCreated,
}: {
  /** En la cuenta de qué línea se crea; sin ella, la de por defecto de quien la crea. */
  line?: string;
  lineLabel?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("es_AR");
  const [category, setCategory] = useState<NewTemplateInput["category"]>("UTILITY");
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const count = useMemo(() => variableCountOf(body), [body]);
  // Un ejemplo por variable; al agregar o quitar variables se ajusta el largo.
  const exampleValues = useMemo(() => Array.from({ length: count }, (_, i) => examples[i] ?? ""), [count, examples]);

  const input: NewTemplateInput = { name, language, category, header, body, footer, examples: exampleValues };
  const problem = validateNewTemplate(input);

  function insertVariable() {
    const next = count + 1;
    const token = `{{${next}}}`;
    const el = bodyRef.current;
    const at = el ? el.selectionStart : body.length;
    setBody(body.slice(0, at) + token + body.slice(at));
  }

  async function submit() {
    setTouched(true);
    if (problem) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch(withLine("/api/whatsapp/templates", line), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, header: header.trim() || undefined, footer: footer.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(data.error ?? "No se pudo crear la plantilla");
        return;
      }
      onCreated();
    } catch {
      setServerError("No se pudo conectar. Probá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  const preview = fillTemplate(body, exampleValues);

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lineLabel ? `Nueva plantilla · ${lineLabel}` : "Nueva plantilla"}</DialogTitle>
          <DialogDescription>
            Se envía a revisión de Meta. Queda «En revisión» hasta que la aprueben (suele ser cuestión de minutos) y
            recién ahí se puede usar. Una vez creada, el texto no se puede editar: hay que crear otra.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="tpl-name">Nombre</Label>
            <Input
              id="tpl-name"
              value={name}
              maxLength={512}
              placeholder="kristall_presentacion_lima"
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
            />
            <p className="text-xs text-muted-foreground">Minúsculas, números y guion bajo. Es el identificador interno.</p>
          </div>

          <div className="space-y-1">
            <Label>Idioma</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Categoría</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as NewTemplateInput["category"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {CATEGORIES.find((c) => c.value === category)?.hint}
          </p>

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="tpl-header">Encabezado (opcional)</Label>
            <Input id="tpl-header" value={header} maxLength={60} onChange={(e) => setHeader(e.target.value)} />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="tpl-body">Mensaje</Label>
              <Button type="button" variant="outline" size="sm" onClick={insertVariable}>
                <Plus />
                Variable {`{{${count + 1}}}`}
              </Button>
            </div>
            <Textarea
              id="tpl-body"
              ref={bodyRef}
              rows={7}
              value={body}
              maxLength={1024}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hola {{1}}, ..."
            />
            <p className="text-right text-xs text-muted-foreground">{body.length}/1024</p>
          </div>

          {count > 0 && (
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium">Ejemplos de cada variable</p>
              <p className="text-xs text-muted-foreground">Meta los pide para revisar la plantilla: un valor realista de cada una.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {exampleValues.map((value, i) => (
                  <Input
                    key={i}
                    aria-label={`Ejemplo de la variable ${i + 1}`}
                    placeholder={`Ejemplo de {{${i + 1}}}`}
                    value={value}
                    maxLength={300}
                    onChange={(e) =>
                      setExamples(exampleValues.map((v, j) => (j === i ? e.target.value : v)))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="tpl-footer">Pie (opcional)</Label>
            <Input id="tpl-footer" value={footer} maxLength={60} onChange={(e) => setFooter(e.target.value)} />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <p className="text-sm font-medium">Así se va a ver</p>
            <div className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">
              {header.trim() && <p className="mb-1 font-semibold">{header}</p>}
              {preview || <span className="text-muted-foreground">El mensaje aparece acá.</span>}
              {footer.trim() && <p className="mt-2 text-xs text-muted-foreground">{footer}</p>}
            </div>
          </div>
        </div>

        {touched && problem && <p className="text-sm text-destructive">{problem}</p>}
        {serverError && <p className="text-sm text-destructive">{serverError}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <Send />}
            Enviar a revisión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
