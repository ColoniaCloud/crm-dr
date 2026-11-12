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
import { AlertTriangle, CheckCircle2, Loader2, Plus, Send, Sparkles, Trash2 } from "@/components/icons";
import { cn } from "@/lib/utils";
import { withLine } from "@/lib/whatsapp/line-url";
import { fillTemplate } from "@/lib/whatsapp/message-view";
import type { ReviewPart, ReviewVerdict, TemplateReview } from "@/lib/whatsapp/template-review";
import {
  BUTTON_LIMITS,
  BUTTON_TYPE_LABEL,
  TEMPLATE_LANGUAGES,
  buttonNotices,
  validateNewTemplate,
  type NewTemplateInput,
  type TemplateButton,
  type TemplateButtonType,
} from "@/lib/whatsapp/template-rules";
import { TemplateButtonsPreview } from "./template-buttons";

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

const BUTTON_TYPES = Object.keys(BUTTON_TYPE_LABEL) as TemplateButtonType[];

const BUTTON_HINT: Record<TemplateButtonType, string> = {
  QUICK_REPLY: "Al tocarlo, la persona te contesta con ese texto.",
  URL: "Abre una página en el navegador.",
  PHONE_NUMBER: "Llama a un teléfono.",
};

/** Cómo se muestra cada veredicto de la IA. Mismos colores que el estado de las plantillas. */
const VERDICT: Record<ReviewVerdict, { title: string; chip: string; box: string; text: string }> = {
  ok: {
    title: "Se puede mandar",
    chip: "Correcto",
    box: "border-green-500/30 bg-green-500/10",
    text: "text-green-700 dark:text-green-400",
  },
  risky: {
    title: "Puede traer problemas",
    chip: "Con riesgo",
    box: "border-amber-500/30 bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-400",
  },
  wrong: {
    title: "No conviene mandarla así",
    chip: "No corresponde",
    box: "border-red-500/30 bg-red-500/10",
    text: "text-red-700 dark:text-red-400",
  },
};

const PART_LABEL: Record<ReviewPart, string> = {
  name: "Nombre",
  category: "Categoría",
  header: "Encabezado",
  body: "Mensaje",
  footer: "Pie",
  buttons: "Botones",
};

const variableCountOf = (body: string): number => {
  const nums = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
};

const emptyButton = (type: TemplateButtonType): TemplateButton =>
  type === "URL" ? { type, text: "", url: "" } : type === "PHONE_NUMBER" ? { type, text: "", phone: "" } : { type, text: "" };

/**
 * Crea una plantilla y la manda a revisión de Meta. Valida las reglas de formato
 * antes de enviar (las mismas que valida el servidor) para no recibir un rechazo
 * críptico, y muestra el mensaje como va a verse, con los ejemplos puestos.
 *
 * Los botones son opcionales. Lo que tiene una respuesta exacta (largos,
 * cantidades, orden) lo bloquean las reglas; lo que es cuestión de criterio —si
 * el botón corresponde en ese mensaje, si la categoría va a ser la elegida— lo
 * opina la IA contra los lineamientos de Meta. Esa opinión se muestra antes de
 * enviar y no bloquea: Meta decide, y quien crea la plantilla puede mandarla
 * igual.
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
  const [buttons, setButtons] = useState<TemplateButton[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // La revisión vale para el texto exacto que se revisó: `sig` es ese texto. Si
  // después se cambia algo, deja de mostrarse y hay que revisar de nuevo.
  const [review, setReview] = useState<{ sig: string; data: TemplateReview } | null>(null);
  const [reviewError, setReviewError] = useState<{ sig: string; message: string } | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const count = useMemo(() => variableCountOf(body), [body]);
  // Un ejemplo por variable; al agregar o quitar variables se ajusta el largo.
  const exampleValues = useMemo(() => Array.from({ length: count }, (_, i) => examples[i] ?? ""), [count, examples]);

  const input: NewTemplateInput = {
    name,
    language,
    category,
    header: header.trim() || undefined,
    body,
    footer: footer.trim() || undefined,
    examples: exampleValues,
    ...(buttons.length ? { buttons } : {}),
  };
  const problem = validateNewTemplate(input);
  const notices = buttonNotices(buttons);

  const sig = JSON.stringify(input);
  const fresh = review?.sig === sig ? review.data : null;
  const failed = reviewError?.sig === sig ? reviewError.message : null;
  const busy = submitting || reviewing;

  function insertVariable() {
    const next = count + 1;
    const token = `{{${next}}}`;
    const el = bodyRef.current;
    const at = el ? el.selectionStart : body.length;
    setBody(body.slice(0, at) + token + body.slice(at));
  }

  const patchButton = (i: number, patch: Partial<{ text: string; url: string; phone: string }>) =>
    setButtons((prev) => prev.map((b, j) => (j === i ? ({ ...b, ...patch } as TemplateButton) : b)));

  /** Pide la opinión de la IA sobre lo que hay ahora en el formulario. `null` si no se pudo. */
  async function runReview(): Promise<TemplateReview | null> {
    setReviewing(true);
    setReviewError(null);
    try {
      const res = await fetch("/api/whatsapp/templates/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: sig,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.review) {
        setReviewError({ sig, message: data.error ?? "No se pudo revisar con IA." });
        return null;
      }
      setReview({ sig, data: data.review as TemplateReview });
      return data.review as TemplateReview;
    } catch {
      setReviewError({ sig, message: "No se pudo conectar para revisar con IA." });
      return null;
    } finally {
      setReviewing(false);
    }
  }

  async function reviewNow() {
    setTouched(true);
    if (problem) return;
    await runReview();
  }

  async function submit() {
    setTouched(true);
    if (problem) return;

    // Con botones, la primera vez se revisa antes de mandar. Si la IA no ve
    // problemas, sigue de largo; si ve alguno (o no se pudo revisar), se frena para
    // mostrarlo y el botón pasa a ser "Enviar igual": la segunda vez ya no pregunta.
    if (buttons.length && !fresh && !failed) {
      const result = await runReview();
      if (result?.verdict !== "ok") return;
    }

    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch(withLine("/api/whatsapp/templates", line), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: sig,
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
  const submitLabel =
    fresh && fresh.verdict !== "ok" ? "Enviar igual" : failed && buttons.length ? "Enviar sin revisar" : "Enviar a revisión";

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
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

          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Botones (opcional)</p>
                <p className="text-xs text-muted-foreground">
                  Van debajo del mensaje. Hasta {BUTTON_LIMITS.total}: {BUTTON_LIMITS.url} de link y {BUTTON_LIMITS.phone} de
                  llamada como máximo.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={buttons.length >= BUTTON_LIMITS.total}
                onClick={() => setButtons((prev) => [...prev, emptyButton("QUICK_REPLY")])}
              >
                <Plus />
                Agregar botón
              </Button>
            </div>

            {buttons.map((b, i) => {
              const verdict = fresh?.buttons.find((r) => r.index === i);
              return (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <div className="grid flex-1 gap-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
                      <Select
                        value={b.type}
                        onValueChange={(v) =>
                          setButtons((prev) =>
                            prev.map((x, j) => (j === i ? { ...emptyButton(v as TemplateButtonType), text: x.text } : x))
                          )
                        }
                      >
                        <SelectTrigger aria-label={`Tipo del botón ${i + 1}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BUTTON_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {BUTTON_TYPE_LABEL[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="relative">
                        <Input
                          aria-label={`Texto del botón ${i + 1}`}
                          placeholder="Texto del botón"
                          value={b.text}
                          maxLength={BUTTON_LIMITS.text}
                          className="pr-14"
                          onChange={(e) => patchButton(i, { text: e.target.value })}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground">
                          {b.text.length}/{BUTTON_LIMITS.text}
                        </span>
                      </div>
                      {b.type === "URL" && (
                        <Input
                          aria-label={`Link del botón ${i + 1}`}
                          inputMode="url"
                          placeholder="https://kristallfilm.com/..."
                          value={b.url}
                          maxLength={BUTTON_LIMITS.urlLength}
                          className="sm:col-span-2"
                          onChange={(e) => patchButton(i, { url: e.target.value })}
                        />
                      )}
                      {b.type === "PHONE_NUMBER" && (
                        <Input
                          aria-label={`Teléfono del botón ${i + 1}`}
                          inputMode="tel"
                          placeholder="54 9 11 5555-1234 (con código de país)"
                          value={b.phone}
                          maxLength={30}
                          className="sm:col-span-2"
                          onChange={(e) => patchButton(i, { phone: e.target.value })}
                        />
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar el botón ${i + 1}`}
                      title="Quitar"
                      onClick={() => setButtons((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  {verdict ? (
                    <p className={cn("flex items-start gap-1.5 text-xs", VERDICT[verdict.verdict].text)}>
                      {verdict.verdict === "ok" ? (
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      ) : (
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      )}
                      <span>
                        <span className="font-semibold">{VERDICT[verdict.verdict].chip}.</span> {verdict.note}
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{BUTTON_HINT[b.type]}</p>
                  )}
                </div>
              );
            })}

            {notices.map((n) => (
              <p key={n} className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {n}
              </p>
            ))}
          </div>

          <div className="space-y-1 sm:col-span-2">
            <p className="text-sm font-medium">Así se va a ver</p>
            <div className="max-w-sm space-y-1">
              <div className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">
                {header.trim() && <p className="mb-1 font-semibold">{header}</p>}
                {preview || <span className="text-muted-foreground">El mensaje aparece acá.</span>}
                {footer.trim() && <p className="mt-2 text-xs text-muted-foreground">{footer}</p>}
              </div>
              <TemplateButtonsPreview buttons={buttons} />
            </div>
          </div>
        </div>

        <div aria-live="polite" className="space-y-2">
          {reviewing && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Revisando contra los lineamientos de Meta…
            </p>
          )}

          {fresh && !reviewing && (
            <div className={cn("space-y-2 rounded-lg border p-3 text-sm", VERDICT[fresh.verdict].box)}>
              <p className={cn("flex items-center gap-2 font-semibold", VERDICT[fresh.verdict].text)}>
                {fresh.verdict === "ok" ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
                Revisión con IA: {VERDICT[fresh.verdict].title}
              </p>
              <p>{fresh.summary}</p>
              {fresh.likelyCategory !== category && (
                <p>
                  Elegiste {CATEGORIES.find((c) => c.value === category)?.label} y lo más probable es que Meta la tome como{" "}
                  <span className="font-semibold">{CATEGORIES.find((c) => c.value === fresh.likelyCategory)?.label}</span>.
                </p>
              )}
              {fresh.issues.length > 0 && (
                <ul className="space-y-1.5">
                  {fresh.issues.map((issue, i) => (
                    <li key={i}>
                      <span className="font-medium">{PART_LABEL[issue.part]}:</span> {issue.problem}
                      {issue.fix && <span className="block text-muted-foreground">Sugerencia: {issue.fix}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Es una opinión basada en los lineamientos de Meta. La decisión final es de Meta: puede aprobar o
                rechazar distinto.
              </p>
            </div>
          )}

          {failed && !reviewing && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {failed} Podés enviarla igual: Meta la revisa de todos modos.
            </p>
          )}

          {touched && problem && <p className="text-sm text-destructive">{problem}</p>}
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={() => void reviewNow()} disabled={busy}>
            {reviewing ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Revisar con IA
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {submitting ? <Loader2 className="animate-spin" /> : <Send />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
