"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Paperclip, Trash2, ExternalLink } from "@/components/icons";
import { expenseMonthlyShares, monthKeyOf, monthSpan, MAX_RECEIPT_BYTES, RECEIPT_MIME_TYPES } from "@/lib/expenses";
import {
  apiJson,
  dateInputToISO,
  fmtMoney,
  isoDateAR,
  PAYMENT_METHODS,
  type Expense,
  type ExpenseCategory,
  type ExpenseReceipt,
  type SupplierOption,
} from "./types";

const OTHER_SUPPLIER = "__other__";
const NO_SUPPLIER = "__none__";
const NO_METHOD = "__none__";

interface FormState {
  categoryId: string;
  description: string;
  amount: string;
  currency: "ARS" | "USD";
  exchangeRate: string;
  paidAt: string;
  hasPeriod: boolean;
  periodStart: string;
  periodEnd: string;
  supplierChoice: string;
  supplierName: string;
  method: string;
  notes: string;
}

function emptyForm(): FormState {
  const today = isoDateAR(new Date());
  const month = today.slice(0, 7);
  return {
    categoryId: "",
    description: "",
    amount: "",
    currency: "ARS",
    exchangeRate: "",
    paidAt: today,
    hasPeriod: false,
    periodStart: month,
    periodEnd: month,
    supplierChoice: NO_SUPPLIER,
    supplierName: "",
    method: NO_METHOD,
    notes: "",
  };
}

function fromExpense(e: Expense): FormState {
  const paid = isoDateAR(e.paidAt);
  return {
    categoryId: e.categoryId,
    description: e.description,
    amount: String(Number(e.amount)),
    currency: e.currency,
    exchangeRate: e.exchangeRate ? String(Number(e.exchangeRate)) : "",
    paidAt: paid,
    hasPeriod: !!e.periodStart,
    periodStart: e.periodStart ?? paid.slice(0, 7),
    periodEnd: e.periodEnd ?? paid.slice(0, 7),
    supplierChoice: e.supplierId ?? (e.supplierName ? OTHER_SUPPLIER : NO_SUPPLIER),
    supplierName: e.supplierName ?? "",
    method: e.method ?? NO_METHOD,
    notes: e.notes ?? "",
  };
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  categories,
  suppliers,
  usdRate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expense: Expense | null;
  categories: ExpenseCategory[];
  suppliers: SupplierOption[];
  usdRate: number | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [files, setFiles] = useState<File[]>([]);
  const [receipts, setReceipts] = useState<ExpenseReceipt[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Si el gasto nuevo se guardó pero falló un adjunto, reintentar edita ese
  // gasto en vez de crear otro.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(expense ? fromExpense(expense) : emptyForm());
    setReceipts(expense?.receipts ?? []);
    setFiles([]);
    setError("");
    setCreatedId(null);
  }, [open, expense]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Las archivadas solo aparecen si es la del gasto que se edita.
  const categoryOptions = categories.filter((c) => c.active || c.id === form.categoryId);

  const amountARS = useMemo(() => {
    const a = Number(form.amount);
    if (!a) return 0;
    if (form.currency === "USD") return a * (Number(form.exchangeRate) || 0);
    return a;
  }, [form.amount, form.currency, form.exchangeRate]);

  const months = form.hasPeriod ? monthSpan(form.periodStart, form.periodEnd) : 0;
  const preview =
    form.hasPeriod && months > 0 && amountARS > 0
      ? expenseMonthlyShares({ amountARS, paidAt: new Date(), periodStart: form.periodStart, periodEnd: form.periodEnd })
      : null;

  function changeCurrency(v: "ARS" | "USD") {
    setForm((f) => ({ ...f, currency: v, exchangeRate: v === "USD" && !f.exchangeRate && usdRate ? String(usdRate) : f.exchangeRate }));
  }

  function changePaidAt(v: string) {
    // Si el período era "el mes del pago", lo acompaña.
    setForm((f) => {
      const oldMonth = f.paidAt.slice(0, 7);
      const follow = f.periodStart === oldMonth && f.periodEnd === oldMonth;
      return { ...f, paidAt: v, ...(follow && v ? { periodStart: v.slice(0, 7), periodEnd: v.slice(0, 7) } : {}) };
    });
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: File[] = [];
    for (const f of Array.from(list)) {
      if (!RECEIPT_MIME_TYPES.includes(f.type)) {
        setError(`"${f.name}": solo imágenes (JPG, PNG, WEBP) o PDF`);
        continue;
      }
      if (f.size > MAX_RECEIPT_BYTES) {
        setError(`"${f.name}" pesa más de 5 MB`);
        continue;
      }
      next.push(f);
    }
    setFiles((prev) => [...prev, ...next]);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function removeReceipt(id: string) {
    if (!confirm("¿Eliminar este comprobante?")) return;
    try {
      await apiJson(`/api/expenses/receipts/${id}`, { method: "DELETE" });
      setReceipts((r) => r.filter((x) => x.id !== id));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el comprobante");
    }
  }

  async function submit() {
    setError("");
    if (!form.categoryId) return setError("Elegí una categoría");
    if (!form.description.trim()) return setError("La descripción es obligatoria");
    if (!(Number(form.amount) > 0)) return setError("El monto tiene que ser mayor a cero");
    if (!form.paidAt) return setError("Falta la fecha de pago");
    if (form.currency === "USD" && !(Number(form.exchangeRate) > 0)) return setError("Falta la cotización del dólar");
    if (form.hasPeriod && months === 0) return setError("El período termina antes de empezar");

    const body = {
      categoryId: form.categoryId,
      description: form.description,
      amount: Number(form.amount),
      currency: form.currency,
      exchangeRate: form.currency === "USD" ? Number(form.exchangeRate) : null,
      paidAt: dateInputToISO(form.paidAt),
      periodStart: form.hasPeriod ? form.periodStart : null,
      periodEnd: form.hasPeriod ? form.periodEnd : null,
      supplierId: form.supplierChoice !== OTHER_SUPPLIER && form.supplierChoice !== NO_SUPPLIER ? form.supplierChoice : null,
      supplierName: form.supplierChoice === OTHER_SUPPLIER ? form.supplierName : null,
      method: form.method === NO_METHOD ? null : form.method,
      notes: form.notes,
    };

    setSaving(true);
    try {
      const existingId = expense?.id ?? createdId;
      const saved = await apiJson<{ id: string }>(existingId ? `/api/expenses/${existingId}` : "/api/expenses", {
        method: existingId ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      if (!existingId) setCreatedId(saved.id);
      const failed: string[] = [];
      for (const f of files) {
        try {
          await apiJson(`/api/expenses/${saved.id}/receipts`, {
            method: "POST",
            body: JSON.stringify({ fileName: f.name, mimeType: f.type, data: await readAsBase64(f) }),
          });
        } catch {
          failed.push(f.name);
        }
      }
      onSaved();
      if (failed.length) {
        // El gasto quedó guardado; lo que falló es solo el adjunto.
        setFiles(files.filter((f) => failed.includes(f.name)));
        setError(`El gasto se guardó, pero no se pudo adjuntar: ${failed.join(", ")}`);
        return;
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el gasto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{expense ? `Editar gasto #${expense.number}` : "Nuevo gasto"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="exp-desc">Descripción *</Label>
            <Input id="exp-desc" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Ej: Alquiler del local, seguro de la camioneta" />
          </div>

          <div className="space-y-1">
            <Label>Categoría *</Label>
            <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
              <SelectTrigger aria-label="Categoría"><SelectValue placeholder="Elegir…" /></SelectTrigger>
              <SelectContent>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{!c.active ? " (archivada)" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="exp-paid">Fecha de pago *</Label>
            <Input id="exp-paid" type="date" value={form.paidAt} onChange={(e) => changePaidAt(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="exp-amount">Monto *</Label>
            <div className="flex gap-2">
              <Select value={form.currency} onValueChange={(v) => changeCurrency(v as "ARS" | "USD")}>
                <SelectTrigger className="w-24 shrink-0" aria-label="Moneda"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARS">ARS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
              <Input id="exp-amount" type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" />
            </div>
          </div>

          {form.currency === "USD" ? (
            <div className="space-y-1">
              <Label htmlFor="exp-rate">Cotización (ARS por USD) *</Label>
              <Input id="exp-rate" type="number" inputMode="decimal" min="0" step="0.01" value={form.exchangeRate} onChange={(e) => set("exchangeRate", e.target.value)} />
              {amountARS > 0 && <p className="text-xs text-muted-foreground">= {fmtMoney(amountARS)} — queda fijo con esta cotización</p>}
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Medio de pago</Label>
              <Select value={form.method} onValueChange={(v) => set("method", v)}>
                <SelectTrigger aria-label="Medio de pago"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_METHOD}>Sin especificar</SelectItem>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.currency === "USD" && (
            <div className="space-y-1 sm:col-span-2">
              <Label>Medio de pago</Label>
              <Select value={form.method} onValueChange={(v) => set("method", v)}>
                <SelectTrigger aria-label="Medio de pago"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_METHOD}>Sin especificar</SelectItem>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Período */}
          <div className="sm:col-span-2 rounded-lg border border-border p-3 space-y-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox checked={form.hasPeriod} onCheckedChange={(v) => set("hasPeriod", v === true)} className="mt-0.5" />
              <span>
                <span className="text-sm font-medium">Cubre un período</span>
                <span className="block text-xs text-muted-foreground">
                  Ej: un seguro anual o un abono trimestral. El balance lo reparte en partes iguales entre esos meses.
                </span>
              </span>
            </label>
            {form.hasPeriod && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="exp-ps">Desde (mes)</Label>
                    <Input id="exp-ps" type="month" value={form.periodStart} onChange={(e) => set("periodStart", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="exp-pe">Hasta (mes)</Label>
                    <Input id="exp-pe" type="month" value={form.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} />
                  </div>
                </div>
                {preview && (
                  <p className="text-xs text-muted-foreground">
                    {months === 1 ? "1 mes" : `${months} meses`} · {fmtMoney(preview[0].amount)} por mes
                    {form.paidAt && !preview.some((p) => p.month === monthKeyOf(new Date(dateInputToISO(form.paidAt))))
                      ? " · el mes del pago queda fuera del período"
                      : ""}
                  </p>
                )}
                {form.hasPeriod && months === 0 && <p className="text-xs text-destructive">El período termina antes de empezar</p>}
              </>
            )}
          </div>

          <div className="space-y-1">
            <Label>Proveedor</Label>
            <Select value={form.supplierChoice} onValueChange={(v) => set("supplierChoice", v)}>
              <SelectTrigger aria-label="Proveedor"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SUPPLIER}>Sin proveedor</SelectItem>
                <SelectItem value={OTHER_SUPPLIER}>Otro (escribir)…</SelectItem>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {form.supplierChoice === OTHER_SUPPLIER ? (
            <div className="space-y-1">
              <Label htmlFor="exp-sup">Nombre del proveedor</Label>
              <Input id="exp-sup" value={form.supplierName} onChange={(e) => set("supplierName", e.target.value)} placeholder="Ej: Inmobiliaria, Meta, Edenor" />
            </div>
          ) : (
            <div className="hidden sm:block" />
          )}

          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="exp-notes">Notas</Label>
            <Textarea id="exp-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          {/* Comprobantes */}
          <div className="sm:col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <Label>Comprobantes</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                <Paperclip className="h-4 w-4 mr-1.5" />
                Adjuntar
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept={RECEIPT_MIME_TYPES.join(",")}
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>
            {receipts.length === 0 && files.length === 0 && (
              <p className="text-xs text-muted-foreground">Foto o PDF de la factura o el ticket, hasta 5 MB cada uno.</p>
            )}
            <ul className="space-y-1">
              {receipts.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
                  <span className="truncate flex-1">{r.fileName}</span>
                  <a href={`/api/expenses/receipts/${r.id}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" aria-label={`Ver ${r.fileName}`}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button type="button" onClick={() => removeReceipt(r.id)} aria-label={`Eliminar ${r.fileName}`} className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5 text-sm">
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="text-xs text-muted-foreground">se sube al guardar</span>
                  <button type="button" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} aria-label={`Quitar ${f.name}`} className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando..." : expense ? "Guardar cambios" : "Cargar gasto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
