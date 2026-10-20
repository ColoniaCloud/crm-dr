"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "@/components/icons";
import { monthLabel } from "@/lib/expenses";
import { cn } from "@/lib/utils";
import {
  apiJson,
  fmtMoney,
  isoDateAR,
  PAYMENT_METHODS,
  type ExpenseCategory,
  type RecurringExpense,
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
  supplierChoice: string;
  supplierName: string;
  method: string;
  dayOfMonth: string;
  startMonth: string;
  hasEnd: boolean;
  endMonth: string;
  active: boolean;
  notes: string;
}

function emptyForm(): FormState {
  const month = isoDateAR(new Date()).slice(0, 7);
  return {
    categoryId: "",
    description: "",
    amount: "",
    currency: "ARS",
    supplierChoice: NO_SUPPLIER,
    supplierName: "",
    method: NO_METHOD,
    dayOfMonth: "1",
    startMonth: month,
    hasEnd: false,
    endMonth: month,
    active: true,
    notes: "",
  };
}

function fromRecurring(r: RecurringExpense): FormState {
  return {
    categoryId: r.categoryId,
    description: r.description,
    amount: String(Number(r.amount)),
    currency: r.currency,
    supplierChoice: r.supplierId ?? (r.supplierName ? OTHER_SUPPLIER : NO_SUPPLIER),
    supplierName: r.supplierName ?? "",
    method: r.method ?? NO_METHOD,
    dayOfMonth: String(r.dayOfMonth),
    startMonth: r.startMonth,
    hasEnd: !!r.endMonth,
    endMonth: r.endMonth ?? r.startMonth,
    active: r.active,
    notes: r.notes ?? "",
  };
}

export function RecurringTab({ categories, suppliers }: { categories: ExpenseCategory[]; suppliers: SupplierOption[] }) {
  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await apiJson<RecurringExpense[]>("/api/expenses/recurring"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los recurrentes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormError("");
    setOpen(true);
  }

  function openEdit(r: RecurringExpense) {
    setEditing(r);
    setForm(fromRecurring(r));
    setFormError("");
    setOpen(true);
  }

  async function submit() {
    setFormError("");
    const body = {
      categoryId: form.categoryId,
      description: form.description,
      amount: Number(form.amount),
      currency: form.currency,
      supplierId: form.supplierChoice !== OTHER_SUPPLIER && form.supplierChoice !== NO_SUPPLIER ? form.supplierChoice : null,
      supplierName: form.supplierChoice === OTHER_SUPPLIER ? form.supplierName : null,
      method: form.method === NO_METHOD ? null : form.method,
      dayOfMonth: Number(form.dayOfMonth),
      startMonth: form.startMonth,
      endMonth: form.hasEnd ? form.endMonth : null,
      active: form.active,
      notes: form.notes,
    };
    setSaving(true);
    try {
      await apiJson(editing ? `/api/expenses/recurring/${editing.id}` : "/api/expenses/recurring", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: RecurringExpense) {
    if (!confirm(`¿Eliminar el recurrente "${r.description}"? Los gastos que ya cargó quedan como están.`)) return;
    try {
      await apiJson(`/api/expenses/recurring/${r.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  const categoryOptions = categories.filter((c) => c.active || c.id === form.categoryId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Gastos que se repiten todos los meses (alquiler, sueldos, abonos). No se cargan solos: cada mes aparecen arriba de la lista de gastos para cargarlos con un clic.
        </p>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo recurrente
        </Button>
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {loading ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Cargando...</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Todavía no hay gastos recurrentes</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((r) => (
            <Card key={r.id} className={cn(!r.active && "opacity-60")}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.description}</p>
                    <p className="text-xs text-muted-foreground">{r.category.name}{r.supplier?.name || r.supplierName ? ` · ${r.supplier?.name ?? r.supplierName}` : ""}</p>
                  </div>
                  {!r.active && <Badge variant="outline">Pausado</Badge>}
                </div>
                <p className="text-xl font-bold tabular-nums">{fmtMoney(r.amount, r.currency)}<span className="text-xs font-normal text-muted-foreground"> / mes</span></p>
                <p className="text-xs text-muted-foreground">
                  Vence el día {r.dayOfMonth} · desde {monthLabel(r.startMonth, true)}{r.endMonth ? ` hasta ${monthLabel(r.endMonth, true)}` : ""}
                  {r.lastGeneratedMonth ? ` · último cargado: ${monthLabel(r.lastGeneratedMonth, true)}` : ""}
                </p>
                <div className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Editar recurrente" onClick={() => openEdit(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Eliminar recurrente" onClick={() => remove(r)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar gasto recurrente" : "Nuevo gasto recurrente"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1">
              <Label htmlFor="r-desc">Descripción *</Label>
              <Input id="r-desc" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Ej: Alquiler del local" />
            </div>
            <div className="space-y-1">
              <Label>Categoría *</Label>
              <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
                <SelectTrigger aria-label="Categoría"><SelectValue placeholder="Elegir…" /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-amount">Monto mensual *</Label>
              <div className="flex gap-2">
                <Select value={form.currency} onValueChange={(v) => set("currency", v as "ARS" | "USD")}>
                  <SelectTrigger className="w-24 shrink-0" aria-label="Moneda"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
                <Input id="r-amount" type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-day">Día de pago (1-28)</Label>
              <Input id="r-day" type="number" min="1" max="28" value={form.dayOfMonth} onChange={(e) => set("dayOfMonth", e.target.value)} />
            </div>
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
            <div className="space-y-1">
              <Label htmlFor="r-start">Desde (mes) *</Label>
              <Input id="r-start" type="month" value={form.startMonth} onChange={(e) => set("startMonth", e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium h-[18px]">
                <Checkbox checked={form.hasEnd} onCheckedChange={(v) => set("hasEnd", v === true)} />
                Hasta (mes)
              </label>
              <Input type="month" aria-label="Hasta (mes)" value={form.endMonth} disabled={!form.hasEnd} onChange={(e) => set("endMonth", e.target.value)} />
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
                <Label htmlFor="r-sup">Nombre del proveedor</Label>
                <Input id="r-sup" value={form.supplierName} onChange={(e) => set("supplierName", e.target.value)} />
              </div>
            ) : (
              <div className="hidden sm:block" />
            )}
            <div className="sm:col-span-2 space-y-1">
              <Label htmlFor="r-notes">Notas</Label>
              <Textarea id="r-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
            {editing && (
              <label className="sm:col-span-2 flex items-center gap-2 text-sm">
                <Checkbox checked={form.active} onCheckedChange={(v) => set("active", v === true)} />
                Activo (si lo pausás, deja de proponerse cada mes)
              </label>
            )}
          </div>
          {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving || !form.description || !form.categoryId || !form.amount}>
              {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear recurrente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
