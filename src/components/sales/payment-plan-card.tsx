"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";
import {
  buildInstallmentSchedule,
  INSTALLMENT_STATUS_LABEL,
  PLAN_FREQUENCY_LABEL,
  type InstallmentStatus,
  type PlanFrequency,
} from "@/lib/account-calc";

interface Installment {
  id: string;
  number: number;
  dueDate: string;
  amount: number;
  paid: number;
  remaining: number;
  status: InstallmentStatus;
}

interface Plan {
  id: string;
  installmentCount: number;
  frequency: PlanFrequency;
  firstDueDate: string;
  financedTotal: number;
  interestRate: number | null;
  status: "ACTIVE" | "CANCELLED";
  notes: string | null;
  createdBy: string;
  createdAt: string;
  installments: Installment[];
}

const statusVariant: Record<InstallmentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PAID: "default",
  PARTIAL: "secondary",
  PENDING: "outline",
  OVERDUE: "destructive",
};

/**
 * Plan de cuotas de una venta.
 *
 * Se maneja solo: pide su propio dato a `/api/sales/:id/payment-plan`. La
 * pantalla de la venta solo lo monta, para no seguir engordando ese archivo.
 *
 * Una venta sin plan no está rota — se cobra al contado o con pagos sueltos,
 * que es como funcionan casi todas hoy.
 */
export default function PaymentPlanCard({
  saleId,
  saleTotal,
  isAdmin,
  onChanged,
}: {
  saleId: string;
  saleTotal: number;
  isAdmin: boolean;
  onChanged?: () => void;
}) {
  const { format: formatCurrency } = useCurrency();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const hoy = new Date();
  const enUnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate());
  const [form, setForm] = useState({
    installmentCount: "3",
    frequency: "MONTHLY" as PlanFrequency,
    firstDueDate: enUnMes.toISOString().slice(0, 10),
  });

  const fetchPlan = useCallback(async () => {
    try {
      const res = await fetch(`/api/sales/${saleId}/payment-plan`);
      setPlan(res.ok ? await res.json() : null);
    } catch {
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // Previsualización en vivo: el mismo cálculo que va a usar el servidor.
  const preview = useMemo(() => {
    const n = parseInt(form.installmentCount, 10);
    if (!n || n < 2 || n > 60 || !form.firstDueDate) return [];
    const fecha = new Date(`${form.firstDueDate}T12:00:00`);
    if (Number.isNaN(fecha.getTime())) return [];
    return buildInstallmentSchedule({
      total: saleTotal,
      installmentCount: n,
      frequency: form.frequency,
      firstDueDate: fecha,
    });
  }, [form, saleTotal]);

  async function crearPlan() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/sales/${saleId}/payment-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installmentCount: parseInt(form.installmentCount, 10),
          frequency: form.frequency,
          firstDueDate: new Date(`${form.firstDueDate}T12:00:00`).toISOString(),
        }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || "No se pudo crear el plan");
        return;
      }
      setDialogOpen(false);
      await fetchPlan();
      onChanged?.();
    } catch {
      setError("No se pudo crear el plan");
    } finally {
      setSaving(false);
    }
  }

  async function cancelarPlan() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/sales/${saleId}/payment-plan`, { method: "DELETE" });
      if (res.ok) {
        await fetchPlan();
        onChanged?.();
      }
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return null;

  const activo = plan && plan.status === "ACTIVE";
  const vencidas = plan?.installments.filter((c) => c.status === "OVERDUE").length ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Plan de cuotas
          {vencidas > 0 && (
            <Badge variant="destructive">
              {vencidas} vencida{vencidas > 1 ? "s" : ""}
            </Badge>
          )}
        </CardTitle>
        {isAdmin && (
          activo ? (
            <Button size="sm" variant="outline" onClick={cancelarPlan} disabled={cancelling}>
              <Trash2 className="h-4 w-4 mr-1" />
              {cancelling ? "Cancelando…" : "Cancelar plan"}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />Armar plan
            </Button>
          )
        )}
      </CardHeader>

      <CardContent>
        {!activo ? (
          <p className="text-sm text-muted-foreground">
            {plan?.status === "CANCELLED"
              ? "El plan de cuotas fue cancelado. La venta se cobra con pagos libres."
              : "Esta venta no tiene plan de cuotas. Se cobra al contado o con pagos libres."}
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span>
                {plan.installmentCount} cuotas · {PLAN_FREQUENCY_LABEL[plan.frequency]}
              </span>
              <span>Total financiado: {formatCurrency(plan.financedTotal)}</span>
              {plan.interestRate !== null && <span>Recargo: {plan.interestRate}%</span>}
              <span>Armado por {plan.createdBy}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuota</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead className="text-right">Resta</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.installments.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.number}/{plan.installmentCount}
                    </TableCell>
                    <TableCell>{formatDate(c.dueDate)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.amount)}</TableCell>
                    <TableCell className="text-right text-green-600">
                      {c.paid > 0 ? formatCurrency(c.paid) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.remaining > 0 ? formatCurrency(c.remaining) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[c.status]}>
                        {INSTALLMENT_STATUS_LABEL[c.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Los pagos se imputan solos a la cuota impaga más vieja. El saldo de la venta no depende
              de esta tabla: siempre es el total menos lo pagado.
            </p>
          </>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Armar plan de cuotas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cuotas">Cantidad de cuotas</Label>
                <Input
                  id="cuotas"
                  type="number"
                  min={2}
                  max={60}
                  value={form.installmentCount}
                  onChange={(e) => setForm({ ...form, installmentCount: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="frecuencia">Frecuencia</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(v) => setForm({ ...form, frequency: v as PlanFrequency })}
                >
                  <SelectTrigger id="frecuencia">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Mensual</SelectItem>
                    <SelectItem value="BIWEEKLY">Quincenal</SelectItem>
                    <SelectItem value="WEEKLY">Semanal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="primerVto">Primer vencimiento</Label>
              <Input
                id="primerVto"
                type="date"
                value={form.firstDueDate}
                onChange={(e) => setForm({ ...form, firstDueDate: e.target.value })}
              />
            </div>

            {preview.length > 0 && (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Vista previa — {formatCurrency(saleTotal)} en {preview.length} cuotas, sin recargo
                </p>
                <div className="max-h-40 space-y-1 overflow-y-auto text-sm">
                  {preview.map((c) => (
                    <div key={c.number} className="flex justify-between">
                      <span className="text-muted-foreground">
                        Cuota {c.number} · {formatDate(c.dueDate)}
                      </span>
                      <span>{formatCurrency(c.amount)}</span>
                    </div>
                  ))}
                </div>
                {/*
                  El formateador del CRM no muestra centavos, así que las cuotas
                  redondeadas pueden "no cerrar" a simple vista ($83+$83+$83 para
                  una venta de $250). El total explícito deja claro que sí cierra:
                  el resto de la división se acumula en la última cuota.
                */}
                <div className="mt-2 flex justify-between border-t pt-2 text-sm font-medium">
                  <span>Total</span>
                  <span>{formatCurrency(preview.reduce((s, c) => s + c.amount, 0))}</span>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Si esta venta ya tiene pagos registrados, se imputan solos a las primeras cuotas. No se
              anula ni se recrea nada.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={crearPlan} disabled={saving || preview.length === 0}>
              {saving ? "Creando…" : "Crear plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
