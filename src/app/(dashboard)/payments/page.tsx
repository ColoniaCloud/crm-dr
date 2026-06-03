"use client";

import { useState, useEffect } from "react";
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
  total: number;
  paid: number;
  remaining: number;
}

const paymentMethodLabel: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CHECK: "Cheque",
  CREDIT_CARD: "Tarjeta de Credito",
  OTHER: "Otro",
};

export default function PaymentsPage() {
  const { format: formatCurrency } = useCurrency();
  const [activeTab, setActiveTab] = useState<"payments" | "debts">("payments");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
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

  useEffect(() => {
    async function loadData() {
      await Promise.all([fetchPayments(), fetchDebts()]);
      setLoading(false);
    }
    loadData();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount),
        }),
      });
      if (!res.ok) throw new Error("Error al registrar pago");
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
      setError(
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">Registrar Pago</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Nuevo Pago</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Venta *</Label>
                <DebtSearchSelect
                  debts={debts}
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
                      <SelectItem value="CREDIT_CARD">Tarjeta de Credito</SelectItem>
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
              <DialogFooter>
                <Button type="submit" disabled={creating}>
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
      </div>

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
      ) : (
        <Card>
          <CardContent className="pt-6">
            {/* ── Vista móvil deudas ── */}
            <div className="md:hidden space-y-2">
              {debts.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No hay deudas pendientes</p>}
              {debts.map((debt) => (
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
                {debts.map((debt) => (
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
                {debts.length === 0 && (
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
      )}
    </div>
  );
}
