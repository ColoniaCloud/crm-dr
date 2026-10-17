"use client";

import { useState } from "react";
import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TaskDTO } from "@/lib/crm-tasks";

/**
 * Cerrar una tarea "Contactar a X" del Priorizador: cómo se lo contactó y cómo
 * salió (decisión L6 de AGENTES.md). Con esto el lead queda actualizado y el
 * agente sabe a quién no volver a ponerle en la lista.
 */

const METHODS = [
  { id: "PHONE", label: "Teléfono" },
  { id: "WHATSAPP", label: "WhatsApp" },
  { id: "EMAIL", label: "Email" },
  { id: "IN_PERSON", label: "En persona" },
] as const;

const OUTCOMES = [
  { id: "INTERESTED", label: "Le interesó", hint: "Pasa a seguimiento" },
  { id: "CALL_BACK", label: "Volver a llamar", hint: "Elegís el día" },
  { id: "NO_ANSWER", label: "No contestó", hint: "Vuelve a la lista en unos días" },
  { id: "NOT_INTERESTED", label: "No le interesó", hint: "Sale de la cola" },
] as const;

type Method = (typeof METHODS)[number]["id"];
type Outcome = (typeof OUTCOMES)[number]["id"];

function Chips<T extends string>({
  options, value, onChange,
}: {
  options: ReadonlyArray<{ id: T; label: string; hint?: string }>;
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-lg border px-2.5 py-2 text-left text-sm transition-colors",
            value === o.id ? "border-primary bg-primary/10" : "hover:bg-muted"
          )}
        >
          {o.label}
          {o.hint && <span className="block text-[11px] text-muted-foreground">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function LeadOutcomeDialog({
  task,
  onClose,
  onDone,
}: {
  task: TaskDTO | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [method, setMethod] = useState<Method | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMethod(null);
    setOutcome(null);
    setFollowUp("");
    setNote("");
    setError(null);
  }

  async function submit() {
    if (!task || !method || !outcome) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          outcome,
          followUpDate: outcome === "CALL_BACK" ? followUp || null : null,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");
      reset();
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const listo = Boolean(method && outcome && (outcome !== "CALL_BACK" || followUp));

  return (
    <Dialog open={Boolean(task)} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Cómo salió?</DialogTitle>
          <DialogDescription>{task?.contactName ?? task?.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cómo lo contactaste</Label>
            <Chips options={METHODS} value={method} onChange={setMethod} />
          </div>
          <div className="space-y-1.5">
            <Label>Resultado</Label>
            <Chips options={OUTCOMES} value={outcome} onChange={setOutcome} />
          </div>
          {outcome === "CALL_BACK" && (
            <div className="space-y-1.5">
              <Label htmlFor="followup">¿Cuándo?</Label>
              <Input id="followup" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="w-44" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="outcome-note">Nota (opcional)</Label>
            <Textarea id="outcome-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Qué te dijo, a quién hablarle, qué le ofreciste…" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
          <Button onClick={submit} disabled={!listo || saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Guardar y cerrar tarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
