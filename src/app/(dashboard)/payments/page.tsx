"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";
import { DebtSearchSelect } from "@/components/contact-search-select";

interface Payment {
  id: string;
  number: number;
  date: string;
  clientName: string;
  saleNumber: string;
  amount: number;
  method: string;
}

interface Debt {
  id: string;
  clientName: string;
  saleNumber: string;
  saleId: string;
  contactId: string;
  total: number;
  paid: number;
  remaining: number;
}

interface Declaration {
  id: string;
  date: string;
  clientName: string;
  saleNumber: number;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  hasReceipt: boolean;
  rejectionReason: string | null;
}

const paymentMethodLabel: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CHECK: "Cheque",
  CARD: "Tarjeta de Credito",
  OTHER: "Otro",
};

const declarationStatusLabel: Record<Declaration["status"], string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  REJECTED: "Rechazado",
};

const declarationStatusVariant: Record<Declaration["status"], "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  CONFIRMED: "default",
  REJECTED: "destructive",
};

export default function PaymentsPageWrapper() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
      <PaymentsPage />
    </Suspense>
  );
}

function PaymentsPage() {
  const searchParams = useSearchParams();
  const contactIdFilter = searchParams.get("contactId");
  // Deep link del mail de "nuevo pago declarado": ?tab=declarations&declarationId=...
  const tabFilter = searchParams.get("tab");
  const declarationIdFilter = searchParams.get("declarationId");
  const { format: formatCurrency } = useCurrency();
  const [activeTab, setActiveTab] = useState<"payments" | "debts" | "declarations">(
    contactIdFilter ? "debts" : tabFilter === "declarations" || declarationIdFilter ? "declarations" : "payments"
  );
  const [payments, setPayments] = useState<Payment[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [rejectTarget, setRejectTarget] = useState<Declaration | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [form, setForm] = useState({
    saleId: "",
    amount: "",
    method: "CASH",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  async function fetchPayments() {
    try {
      const res = await fetch("/api/payments");
      if (!res.ok) throw new Error("Error al cargar pagos");
      const json = await res.json();
      setPayments(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  async function fetchDebts() {
    try {
      const res = await fetch("/api/payments/debts");
      if (!res.ok) throw new Error("Error al cargar deudas");
      const json = await res.json();
      setDebts(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  async function fetchDeclarations() {
    try {
      const res = await fetch("/api/payments/declarations");
      if (!res.ok) throw new Error("Error al cargar los pagos declarados");
      const json = await res.json();
      setDeclarations(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  useEffect(() => {
    async function loadData() {
      await Promise.all([fetchPayments(), fetchDebts(), fetchDeclarations()]);
      setLoading(false);
    }
    loadData();
  }, []);

  // Llegó por el link del mail a una declaración puntual: la enfoca en vez de
  // dejar que se pierda en la lista.
  useEffect(() => {
    if (!declarationIdFilter || loading || activeTab !== "declarations") return;
    document.getElementById(`declaration-${declarationIdFilter}`)?.scrollIntoView({ block: "center" });
  }, [declarationIdFilter, loading, activeTab]);

  const pendingDeclarations = declarations.filter((d) => d.status === "PENDING");

  async function handleConfirmDeclaration(id: string) {
    setActingId(id);
    setActionError("");
    try {
      const res = await fetch(`/api/payments/declarations/${id}/confirm`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "No se pudo confirmar el pago");
      await Promise.all([fetchDeclarations(), fetchPayments(), fetchDebts()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo confirmar el pago");
    } finally {
      setActingId(null);
    }
  }

  async function handleRejectDeclaration(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectTarget) return;
    setRejecting(true);
    setActionError("");
    try {
      const res = await fetch(`/api/payments/declarations/${rejectTarget.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "No se pudo rechazar el pago");
      setRejectTarget(null);
      setRejectReason("");
      await fetchDeclarations();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo rechazar el pago");
    } finally {
      setRejecting(false);
    }
  }

  const visibleDebts = contactIdFilter
    ? debts.filter((d) => d.contactId === contactIdFilter)
    : debts;

  useEffect(() => {
    if (!contactIdFilter || loading) return;
    const clientDebts = debts.filter((d) => d.contactId === contactIdFilter);
    if (clientDebts.length === 1) {
      setForm((f) => ({
        ...f,
        saleId: clientDebts[0].saleId,
        amount: clientDebts[0].remaining.toString(),
      }));
      setDialogOpen(true);
    }
  }, [contactIdFilter, debts, loading]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!debts.some((d) => d.saleId === form.saleId)) {
      setFormError("Seleccioná una venta válida de la lista antes de registrar el pago");
      return;
    }
    setCreating(true);
    setFormError("");
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: form.saleId,
          amount: parseFloat(form.amount),
          method: form.method,
          notes: form.notes,
        }),
      });
      if (!res.ok) {
        if (res.status === 404) {
          await fetchDebts();
          throw new Error(
            "La venta seleccionada ya no tiene saldo pendiente o fue eliminada. Volvé a elegirla de la lista actualizada."
          );
        }
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Error al registrar pago");
      }
      setDialogOpen(false);
      setForm({
        saleId: "",
        amount: "",
        method: "CASH",
        date: new Date().toISOString().split("T")[0],
        notes: "",
      });
      fetchPayments();
      fetchDebts();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Error al registrar pago"
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold">Pagos</h1>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (open) setFormError("");
          }}
        >
          <DialogTrigger asChild>
            <Button>Registrar Pago</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Nuevo Pago</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Venta *</Label>
                <DebtSearchSelect
                  debts={visibleDebts}
                  value={form.saleId}
                  onValueChange={(v) => setForm({ ...form, saleId: v })}
                  formatCurrency={formatCurrency}
                  placeholder="Seleccionar venta..."
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Monto *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Metodo de Pago *</Label>
                  <Select
                    value={form.method}
                    onValueChange={(v) => setForm({ ...form, method: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Efectivo</SelectItem>
                      <SelectItem value="TRANSFER">Transferencia</SelectItem>
                      <SelectItem value="CHECK">Cheque</SelectItem>
                      <SelectItem value="CARD">Tarjeta de Credito</SelectItem>
                      <SelectItem value="OTHER">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Fecha</Label>
                <DatePicker
                  value={form.date}
                  onChange={(v) => setForm({ ...form, date: v })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Input
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                />
              </div>
              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={creating || !form.saleId || !form.amount}>
                  {creating ? "Registrando..." : "Registrar Pago"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "payments"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("payments")}
        >
          Pagos Realizados
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "debts"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("debts")}
        >
          Deudas Pendientes
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "declarations"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("declarations")}
        >
          Declaraciones del portal
          {pendingDeclarations.length > 0 && (
            <Badge variant="destructive" className="rounded-full px-1.5 py-0 text-[10px]">
              {pendingDeclarations.length}
            </Badge>
          )}
        </button>
      </div>

      {actionError && activeTab === "declarations" && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{actionError}</div>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground py-8">
          Cargando...
        </p>
      ) : error ? (
        <div className="rounded-md bg-red-50 p-4 text-red-600">{error}</div>
      ) : activeTab === "payments" ? (
        <Card>
          <CardContent className="pt-6">
            {/* ── Vista móvil pagos ── */}
            <div className="md:hidden space-y-2">
              {payments.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No hay pagos registrados</p>}
              {payments.map((payment) => (
                <div key={payment.id} className="rounded-lg border px-3 py-2.5 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-muted-foreground shrink-0">P-{String(payment.number).padStart(2, "0")}</span>
                      <p className="font-medium text-sm truncate">{payment.clientName}</p>
                    </div>
                    <span className="font-medium text-sm">{formatCurrency(payment.amount)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Venta {payment.saleNumber}</span>
                    <span>{paymentMethodLabel[payment.method] || payment.method}</span>
                    <span>{formatDate(payment.date)}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* ── Vista desktop pagos ── */}
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Nro</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Venta</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Metodo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-muted-foreground">P-{String(payment.number).padStart(2, "0")}</TableCell>
                    <TableCell>{formatDate(payment.date)}</TableCell>
                    <TableCell>{payment.clientName}</TableCell>
                    <TableCell>{payment.saleNumber}</TableCell>
                    <TableCell>{formatCurrency(payment.amount)}</TableCell>
                    <TableCell>
                      {paymentMethodLabel[payment.method] || payment.method}
                    </TableCell>
                  </TableRow>
                ))}
                {payments.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground"
                    >
                      No hay pagos registrados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      ) : activeTab === "debts" ? (
        <Card>
          <CardContent className="pt-6">
            {/* ── Vista móvil deudas ── */}
            <div className="md:hidden space-y-2">
              {visibleDebts.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No hay deudas pendientes</p>}
              {visibleDebts.map((debt) => (
                <div key={debt.id} className="rounded-lg border px-3 py-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{debt.clientName}</p>
                    <span className="font-medium text-sm text-red-600">{formatCurrency(debt.remaining)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Venta {debt.saleNumber}</span>
                    <span>Total: {formatCurrency(debt.total)}</span>
                    <span>Pagado: {formatCurrency(debt.paid)}</span>
                  </div>
                  <Button size="sm" className="h-7 text-xs w-full mt-1" onClick={() => { setForm({ ...form, saleId: debt.saleId, amount: debt.remaining.toString() }); setDialogOpen(true); }}>
                    Pagar
                  </Button>
                </div>
              ))}
            </div>
            {/* ── Vista desktop deudas ── */}
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Venta</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Pagado</TableHead>
                  <TableHead>Restante</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleDebts.map((debt) => (
                  <TableRow key={debt.id}>
                    <TableCell className="font-medium">
                      {debt.clientName}
                    </TableCell>
                    <TableCell>{debt.saleNumber}</TableCell>
                    <TableCell>{formatCurrency(debt.total)}</TableCell>
                    <TableCell>{formatCurrency(debt.paid)}</TableCell>
                    <TableCell>
                      <span className="font-medium text-red-600">
                        {formatCurrency(debt.remaining)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => {
                          setForm({
                            ...form,
                            saleId: debt.saleId,
                            amount: debt.remaining.toString(),
                          });
                          setDialogOpen(true);
                        }}
                      >
                        Pagar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {visibleDebts.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground"
                    >
                      No hay deudas pendientes
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            {/* ── Vista móvil declaraciones ── */}
            <div className="md:hidden space-y-2">
              {declarations.length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  Todavía no hay pagos declarados desde el portal
                </p>
              )}
              {declarations.map((d) => (
                <div
                  key={d.id}
                  id={`declaration-${d.id}`}
                  className={`rounded-lg border px-3 py-2.5 space-y-1 ${
                    d.id === declarationIdFilter ? "border-primary ring-2 ring-primary/40" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{d.clientName}</p>
                    <span className="font-medium text-sm">{formatCurrency(d.amount)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Venta {d.saleNumber}</span>
                    <span>{paymentMethodLabel[d.method] || d.method}</span>
                    <span>{formatDate(d.date)}</span>
                    <Badge variant={declarationStatusVariant[d.status]}>{declarationStatusLabel[d.status]}</Badge>
                  </div>
                  {d.hasReceipt && (
                    <a
                      href={`/api/payments/declarations/${d.id}/receipt`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline"
                    >
                      Ver comprobante
                    </a>
                  )}
                  {d.status === "PENDING" && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="h-7 text-xs flex-1"
                        disabled={actingId === d.id}
                        onClick={() => handleConfirmDeclaration(d.id)}
                      >
                        Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex-1"
                        disabled={actingId === d.id}
                        onClick={() => setRejectTarget(d)}
                      >
                        Rechazar
                      </Button>
                    </div>
                  )}
                  {d.status === "REJECTED" && d.rejectionReason && (
                    <p className="text-xs text-muted-foreground">Motivo: {d.rejectionReason}</p>
                  )}
                </div>
              ))}
            </div>
            {/* ── Vista desktop declaraciones ── */}
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Venta</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Metodo</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {declarations.map((d) => (
                  <TableRow
                    key={d.id}
                    id={`declaration-${d.id}`}
                    className={d.id === declarationIdFilter ? "bg-primary/5 outline outline-2 outline-primary/40" : ""}
                  >
                    <TableCell>{formatDate(d.date)}</TableCell>
                    <TableCell className="font-medium">{d.clientName}</TableCell>
                    <TableCell>{d.saleNumber}</TableCell>
                    <TableCell>{formatCurrency(d.amount)}</TableCell>
                    <TableCell>{paymentMethodLabel[d.method] || d.method}</TableCell>
                    <TableCell>{d.reference || "—"}</TableCell>
                    <TableCell>
                      {d.hasReceipt ? (
                        <a
                          href={`/api/payments/declarations/${d.id}/receipt`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline"
                        >
                          Ver
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={declarationStatusVariant[d.status]}>{declarationStatusLabel[d.status]}</Badge>
                      {d.status === "REJECTED" && d.rejectionReason && (
                        <p className="mt-1 text-xs text-muted-foreground">{d.rejectionReason}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.status === "PENDING" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={actingId === d.id}
                            onClick={() => handleConfirmDeclaration(d.id)}
                          >
                            Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actingId === d.id}
                            onClick={() => setRejectTarget(d)}
                          >
                            Rechazar
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {declarations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      Todavía no hay pagos declarados desde el portal
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={rejectTarget !== null} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar pago declarado</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRejectDeclaration} className="space-y-4">
            {rejectTarget && (
              <p className="text-sm text-muted-foreground">
                {rejectTarget.clientName} · Venta {rejectTarget.saleNumber} ·{" "}
                {formatCurrency(rejectTarget.amount)}
              </p>
            )}
            <div className="space-y-2">
              <Label>Motivo *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ej: no encontramos la transferencia en el resumen bancario"
                required
                minLength={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={rejecting || rejectReason.trim().length < 3}>
                {rejecting ? "Rechazando..." : "Rechazar pago"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
