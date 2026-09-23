"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Undo2, AlertTriangle } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";

interface ReturnableItem {
  saleItemId: string;
  productId: string;
  productName: string;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  returned: number;
  returnable: number;
}

interface SaleReturn {
  id: string;
  number: number;
  refund: "CREDIT_NOTE" | "CASH";
  total: number;
  reason: string | null;
  retainedRolls: string | null;
  createdAt: string;
  user: { id: string; name: string };
  items: {
    id: string;
    productName: string;
    sku: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
}

const REFUND_LABEL: Record<SaleReturn["refund"], string> = {
  CREDIT_NOTE: "Nota de crédito",
  CASH: "Efectivo reintegrado",
};

/**
 * Devoluciones de una venta.
 *
 * Se maneja solo, igual que `PaymentPlanCard`: pide su dato a
 * `/api/sales/:id/returns` y la pantalla de la venta solo lo monta.
 *
 * Devolver NO edita la venta: el total, el remito y la factura quedan como
 * fueron, y lo que cambia es el stock y la cuenta corriente del cliente. Por
 * eso esto es una tarjeta aparte y no un botón de "editar productos".
 */
export default function SaleReturnsCard({
  saleId,
  isAdmin,
  onChanged,
}: {
  saleId: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const { format: formatCurrency } = useCurrency();

  const [items, setItems] = useState<ReturnableItem[]>([]);
  const [returns, setReturns] = useState<SaleReturn[]>([]);
  const [returnable, setReturnable] = useState(false);
  // Cuánto se acredita por cada peso de mercadería: con IVA es mayor a 1, con
  // descuento menor. Lo manda el backend para que la previsualización y lo que
  // se emite sean el mismo número.
  const [ratio, setRatio] = useState(1);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  // saleItemId → cantidad escrita. Se guarda como texto para que el input
  // pueda quedar vacío mientras el operador lo piensa.
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [refund, setRefund] = useState<"CREDIT_NOTE" | "CASH">("CREDIT_NOTE");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/${saleId}/returns`);
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
      setReturns(data.returns ?? []);
      setReturnable(Boolean(data.returnable));
      setRatio(typeof data.creditRatio === "number" ? data.creditRatio : 1);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    fetchReturns();
  }, [fetchReturns]);

  const pendientes = useMemo(() => items.filter((i) => i.returnable > 0), [items]);

  const seleccion = useMemo(
    () =>
      pendientes
        .map((item) => ({ item, quantity: parseInt(quantities[item.saleItemId] ?? "", 10) || 0 }))
        .filter((x) => x.quantity > 0),
    [pendientes, quantities]
  );

  const subtotalSeleccion = useMemo(
    () => seleccion.reduce((suma, x) => suma + x.quantity * x.item.unitPrice, 0),
    [seleccion]
  );

  // Lo que se le acredita al cliente, no el precio de lista: una venta con
  // factura acredita el IVA también, y una con descuento acredita menos.
  const totalSeleccion = useMemo(
    () => Math.round(subtotalSeleccion * ratio * 100) / 100,
    [subtotalSeleccion, ratio]
  );

  function openDialog() {
    setQuantities({});
    setRefund("CREDIT_NOTE");
    setReason("");
    setFormError("");
    setDialogOpen(true);
  }

  async function submit() {
    setFormError("");

    const excedido = seleccion.find((x) => x.quantity > x.item.returnable);
    if (excedido) {
      setFormError(
        `De "${excedido.item.productName}" solo quedan ${excedido.item.returnable} sin devolver`
      );
      return;
    }
    if (seleccion.length === 0) {
      setFormError("Elegí al menos un producto para devolver");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/sales/${saleId}/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refund,
          reason: reason.trim() || undefined,
          items: seleccion.map((x) => ({ saleItemId: x.item.saleItemId, quantity: x.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "No se pudo registrar la devolución");
        return;
      }
      setDialogOpen(false);
      await fetchReturns();
      // La venta en sí no cambia, pero sí el saldo del cliente y los rollos
      // que se muestran arriba.
      onChanged();
    } catch {
      setFormError("No se pudo registrar la devolución");
    } finally {
      setSaving(false);
    }
  }

  // Una venta sin devoluciones y que no admite ninguna (pendiente o anulada)
  // no tiene nada que mostrar: la tarjeta sería ruido en la ficha.
  if (!loading && returns.length === 0 && !returnable) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Undo2 className="h-5 w-5" />
          Devoluciones
        </CardTitle>
        {isAdmin && returnable && pendientes.length > 0 && (
          <Button size="sm" variant="outline" onClick={openDialog}>
            <Undo2 className="h-4 w-4 mr-1" />
            Registrar devolución
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : returns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay devoluciones sobre esta venta.
            {pendientes.length === 0 && " Ya se devolvió todo lo que salió."}
          </p>
        ) : (
          <div className="space-y-4">
            {returns.map((r) => (
              <div key={r.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Devolución #{r.number}</span>
                    <Badge variant={r.refund === "CASH" ? "secondary" : "outline"}>
                      {REFUND_LABEL[r.refund]}
                    </Badge>
                  </div>
                  <span className="font-medium">{formatCurrency(r.total)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(r.createdAt)} · {r.user.name}
                </p>
                <ul className="mt-2 space-y-0.5">
                  {r.items.map((i) => (
                    <li key={i.id} className="flex justify-between gap-4">
                      <span>
                        {i.quantity} × {i.productName}
                      </span>
                      <span className="text-muted-foreground">{formatCurrency(i.total)}</span>
                    </li>
                  ))}
                </ul>
                {r.reason && <p className="mt-2 text-muted-foreground">{r.reason}</p>}
                {r.retainedRolls && (
                  <p className="mt-2 flex items-start gap-1.5 text-amber-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      No volvieron a stock: {r.retainedRolls}. El cliente final ya había activado
                      esa garantía, así que esos rollos siguen asignados a la venta.
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar devolución</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              {pendientes.map((item) => (
                <div key={item.saleItemId} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.returnable} de {item.quantity} sin devolver ·{" "}
                      {formatCurrency(item.unitPrice)} c/u
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={item.returnable}
                    placeholder="0"
                    className="w-20 shrink-0 text-right"
                    value={quantities[item.saleItemId] ?? ""}
                    onChange={(e) =>
                      setQuantities((prev) => ({ ...prev, [item.saleItemId]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Qué pasa con la plata</Label>
              <Select
                value={refund}
                onValueChange={(v) => setRefund(v as "CREDIT_NOTE" | "CASH")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CREDIT_NOTE">Nota de crédito (baja la deuda)</SelectItem>
                  <SelectItem value="CASH">Le devolvemos el efectivo</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {refund === "CREDIT_NOTE"
                  ? "Se emite una nota de crédito en la cuenta corriente. Si ya había pagado todo, le queda saldo a favor."
                  : "Además de la nota de crédito se registra la plata que sale de la caja, así el saldo queda en cero. Solo se puede reintegrar lo que el cliente efectivamente pagó."}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Motivo (opcional)</Label>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Falla de fábrica, cambio de tono, sobró rollo..."
              />
            </div>

            <div className="space-y-1 border-t pt-3 text-sm">
              {Math.abs(ratio - 1) > 0.0001 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Mercadería devuelta</span>
                  <span>{formatCurrency(subtotalSeleccion)}</span>
                </div>
              )}
              <div className="flex justify-between font-medium">
                <span>Se le acredita</span>
                <span>{formatCurrency(totalSeleccion)}</span>
              </div>
              {Math.abs(ratio - 1) > 0.0001 && (
                <p className="text-xs text-muted-foreground">
                  Incluye la parte proporcional del {ratio > 1 ? "IVA" : "descuento"} de la venta.
                </p>
              )}
            </div>

            {formError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{formError}</div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving || seleccion.length === 0}>
              {saving ? "Registrando..." : "Registrar devolución"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
