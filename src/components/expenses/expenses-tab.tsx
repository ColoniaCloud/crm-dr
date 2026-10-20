"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Paperclip, Download, CalendarClock } from "@/components/icons";
import { addMonths, periodLabel } from "@/lib/expenses";
import { ExpenseFormDialog } from "./expense-form-dialog";
import {
  apiJson,
  csvNumber,
  downloadCsv,
  fmtDate,
  fmtMoney,
  isoDateAR,
  type Expense,
  type ExpenseCategory,
  type PendingRecurring,
  type SupplierOption,
} from "./types";

const ALL = "__all__";

export function ExpensesTab({
  categories,
  suppliers,
  usdRate,
}: {
  categories: ExpenseCategory[];
  suppliers: SupplierOption[];
  usdRate: number | null;
}) {
  const currentMonth = isoDateAR(new Date()).slice(0, 7);
  const [from, setFrom] = useState(addMonths(currentMonth, -2));
  const [to, setTo] = useState(currentMonth);
  const [categoryId, setCategoryId] = useState(ALL);
  const [q, setQ] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pending, setPending] = useState<PendingRecurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (categoryId !== ALL) params.set("categoryId", categoryId);
    if (q.trim()) params.set("q", q.trim());
    try {
      const [list, pend] = await Promise.all([
        apiJson<Expense[]>(`/api/expenses?${params}`),
        apiJson<{ pending: PendingRecurring[] }>(`/api/expenses/recurring/pending?month=${currentMonth}`),
      ]);
      setExpenses(list);
      setPending(pend.pending);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los gastos");
    } finally {
      setLoading(false);
    }
  }, [from, to, categoryId, q, currentMonth]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const total = useMemo(() => expenses.reduce((s, e) => s + Number(e.amountARS), 0), [expenses]);
  const byCategory = useMemo(() => {
    const m = new Map<string, { name: string; total: number }>();
    for (const e of expenses) {
      const cur = m.get(e.categoryId) ?? { name: e.category.name, total: 0 };
      cur.total += Number(e.amountARS);
      m.set(e.categoryId, cur);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [expenses]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(e: Expense) {
    setEditing(e);
    setDialogOpen(true);
  }

  async function remove(e: Expense) {
    if (!confirm(`¿Eliminar el gasto #${e.number} "${e.description}"? Se borran también sus comprobantes.`)) return;
    try {
      await apiJson(`/api/expenses/${e.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el gasto");
    }
  }

  async function generate(r: PendingRecurring) {
    let exchangeRate: number | null = null;
    if (r.currency === "USD") {
      const answer = prompt(`Cotización para "${r.description}" (ARS por USD):`, usdRate ? String(usdRate) : "");
      if (!answer) return;
      exchangeRate = Number(answer.replace(",", "."));
      if (!(exchangeRate > 0)) return setError("Cotización inválida");
    }
    setGenerating(r.id);
    try {
      await apiJson(`/api/expenses/recurring/${r.id}/generate`, {
        method: "POST",
        body: JSON.stringify({ month: r.month, exchangeRate }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el gasto");
    } finally {
      setGenerating(null);
    }
  }

  function exportCsv() {
    downloadCsv(`gastos_${from}_${to}.csv`, [
      ["N°", "Fecha de pago", "Categoría", "Descripción", "Proveedor", "Medio de pago", "Moneda", "Monto", "Cotización", "Monto ARS", "Período desde", "Período hasta", "Comprobantes", "Notas", "Cargado por"],
      ...expenses.map((e) => [
        e.number,
        fmtDate(e.paidAt),
        e.category.name,
        e.description,
        e.supplier?.name ?? e.supplierName ?? "",
        e.method ?? "",
        e.currency,
        csvNumber(e.amount),
        e.exchangeRate ? csvNumber(e.exchangeRate) : "",
        csvNumber(e.amountARS),
        e.periodStart ?? "",
        e.periodEnd ?? "",
        e.receipts.length,
        e.notes ?? "",
        e.createdBy.name,
      ]),
    ]);
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">
                {pending.length === 1 ? "Hay 1 gasto recurrente" : `Hay ${pending.length} gastos recurrentes`} de este mes sin cargar
              </p>
            </div>
            <ul className="space-y-2">
              {pending.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium">{r.description}</span>
                  <span className="text-muted-foreground">{r.category.name}</span>
                  <span className="tabular-nums">{fmtMoney(r.amount, r.currency)}</span>
                  <span className="text-muted-foreground text-xs">vence el {r.dayOfMonth}</span>
                  <span className="ml-auto flex gap-2">
                    <Button size="sm" onClick={() => generate(r)} disabled={generating === r.id}>
                      {generating === r.id ? "Cargando…" : "Cargar"}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Se cargan con el monto de la plantilla; si este mes fue distinto, editalo después.</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col lg:flex-row lg:items-end gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
          <div className="space-y-1">
            <Label htmlFor="f-from" className="text-xs">Pagados desde</Label>
            <Input id="f-from" type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-to" className="text-xs">Hasta</Label>
            <Input id="f-to" type="month" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Categoría</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger aria-label="Filtrar por categoría"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-q" className="text-xs">Buscar</Label>
            <Input id="f-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Descripción, proveedor…" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={expenses.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo gasto
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {/* Resumen del filtro */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total pagado en el rango</p>
            <p className="text-2xl font-bold tabular-nums">{loading ? "…" : fmtMoney(total)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {expenses.length} {expenses.length === 1 ? "gasto" : "gastos"} · por fecha de pago, en pesos
            </p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">Por categoría</p>
            {byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="space-y-1.5">
                {byCategory.slice(0, 6).map((c) => (
                  <li key={c.name} className="flex items-center gap-3 text-sm">
                    <span className="w-40 sm:w-56 truncate">{c.name}</span>
                    <span className="flex-1 h-2 rounded-full bg-muted overflow-hidden" aria-hidden>
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${total ? (c.total / total) * 100 : 0}%` }} />
                    </span>
                    <span className="tabular-nums w-28 text-right">{fmtMoney(Math.round(c.total))}</span>
                  </li>
                ))}
                {byCategory.length > 6 && (
                  <li className="text-xs text-muted-foreground">y {byCategory.length - 6} categorías más</li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Móvil */}
          <div className="md:hidden space-y-2 p-4">
            {loading ? (
              <p className="text-center text-muted-foreground py-8 text-sm">Cargando...</p>
            ) : expenses.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No hay gastos en este rango</p>
            ) : (
              expenses.map((e) => (
                <div key={e.id} className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="font-medium text-sm truncate">{e.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(e.paidAt)} · {e.category.name}
                      {e.supplier?.name || e.supplierName ? ` · ${e.supplier?.name ?? e.supplierName}` : ""}
                    </p>
                    {e.periodStart && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{periodLabel(e.periodStart, e.periodEnd)}</Badge>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{fmtMoney(e.amount, e.currency)}</p>
                    <div className="flex gap-1 justify-end mt-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Editar" onClick={() => openEdit(e)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Eliminar" onClick={() => remove(e)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Escritorio */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">N°</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="w-28"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>
                ) : expenses.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No hay gastos en este rango</TableCell></TableRow>
                ) : (
                  expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-muted-foreground tabular-nums">{e.number}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{fmtDate(e.paidAt)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{e.description}</div>
                        {(e.method || e.recurringExpenseId) && (
                          <div className="text-xs text-muted-foreground">
                            {[e.method, e.recurringExpenseId ? "Recurrente" : null].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{e.category.name}</TableCell>
                      <TableCell className="text-sm">{e.supplier?.name ?? e.supplierName ?? "—"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{periodLabel(e.periodStart, e.periodEnd) ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        <div className="font-medium">{fmtMoney(e.amount, e.currency)}</div>
                        {e.currency === "USD" && <div className="text-xs text-muted-foreground">{fmtMoney(e.amountARS)}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          {e.receipts.length > 0 && (
                            <a
                              href={`/api/expenses/receipts/${e.receipts[0].id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                              aria-label={`Ver comprobante${e.receipts.length > 1 ? ` (${e.receipts.length})` : ""}`}
                              title={e.receipts.map((r) => r.fileName).join("\n")}
                            >
                              <Paperclip className="h-4 w-4" />
                            </a>
                          )}
                          <Button size="icon" variant="ghost" aria-label="Editar gasto" onClick={() => openEdit(e)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" aria-label="Eliminar gasto" onClick={() => remove(e)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ExpenseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        expense={editing}
        categories={categories}
        suppliers={suppliers}
        usdRate={usdRate}
        onSaved={load}
      />
    </div>
  );
}
