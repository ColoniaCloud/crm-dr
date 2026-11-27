"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  MANUAL_ADJUSTMENT_LABEL,
  MANUAL_ADJUSTMENT_TYPES,
  signedAdjustmentAmount,
  type ManualAdjustmentType,
} from "@/lib/account-adjustments";

/**
 * Formulario para cargar un ajuste manual de cuenta corriente (solo SUPERADMIN;
 * la ruta lo exige igual). Se monta solo mientras el diálogo está abierto, así
 * cada vez arranca vacío.
 */
export function AccountAdjustmentDialog({
  clientId,
  open,
  onOpenChange,
  onCreated,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<ManualAdjustmentType>("DEBIT_NOTE");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Acepta coma decimal ("1.500,50" / "0,01"), que es como se escribe acá, y
  // también el punto decimal si no hay coma ("0.01").
  const limpio = amount.trim();
  const parsed = Number(limpio.includes(",") ? limpio.replace(/\./g, "").replace(",", ".") : limpio);
  const amountOk = Number.isFinite(parsed) && Math.round(parsed * 100) > 0;
  const descriptionOk = description.trim().length >= 5;
  const signed = amountOk ? signedAdjustmentAmount(type, parsed) : 0;

  async function handleSubmit() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${clientId}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, amount: parsed, description: description.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.errors?.[0]?.message || d.error || "No se pudo cargar el ajuste");
      }
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el ajuste");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cargar ajuste de cuenta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as ManualAdjustmentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_ADJUSTMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {MANUAL_ADJUSTMENT_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="adjustment-amount">Monto (ARS)</Label>
            <Input
              id="adjustment-amount"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {amountOk && (
              <p className="mt-1 text-xs text-muted-foreground">
                {signed > 0 ? "Suma" : "Resta"}{" "}
                ${Math.abs(signed).toLocaleString("es-AR", { minimumFractionDigits: 2 })} al saldo del
                cliente.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="adjustment-description">Motivo</Label>
            <Textarea
              id="adjustment-description"
              rows={3}
              placeholder="Ej.: corrección de redondeo de la devolución #1 (venta #101)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              El cliente ve este texto en el extracto de su panel. El ajuste mueve el saldo de su
              cuenta, no el de una venta en particular.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !amountOk || !descriptionOk}>
            {saving ? "Cargando..." : "Cargar ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
