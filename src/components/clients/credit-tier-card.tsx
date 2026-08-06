"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CreditCard } from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";

interface Tier {
  id: string;
  code: string;
  name: string;
  limit: string;
}

interface CreditTierCardProps {
  clientId: string;
  creditTier: Tier | null;
  consignmentBalance: number;
  canEdit: boolean;
  onChanged?: () => void;
}

/**
 * Escalafón de crédito asignado a un Cliente, para ventas a consignación.
 * Mismo patrón autocontenido que ClientPortalAccess: pide su propia lista de
 * escalafones y guarda con su propio PATCH.
 */
export function CreditTierCard({ clientId, creditTier, consignmentBalance, canEdit, onChanged }: CreditTierCardProps) {
  const { format: formatCurrency } = useCurrency();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(creditTier?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/credit-tiers").then((r) => (r.ok ? r.json() : [])).then(setTiers).catch(() => {});
  }, []);

  useEffect(() => {
    setSelected(creditTier?.id ?? "");
  }, [creditTier?.id]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditTierId: selected }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo guardar");
      setEditing(false);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  const limitNum = creditTier ? Number(creditTier.limit) : null;
  const overLimit = limitNum !== null && consignmentBalance > limitNum;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4" />Escalafón de crédito
        </CardTitle>
        {canEdit && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {creditTier ? "Cambiar" : "Asignar"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {editing ? (
          <div className="space-y-2">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger><SelectValue placeholder="Elegir escalafón" /></SelectTrigger>
              <SelectContent>
                {tiers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.code} — {t.name} (hasta {formatCurrency(Number(t.limit))})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving || !selected}>{saving ? "Guardando..." : "Guardar"}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setSelected(creditTier?.id ?? ""); }}>Cancelar</Button>
            </div>
          </div>
        ) : creditTier ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{creditTier.code} — {creditTier.name}</Badge>
            <span className="text-muted-foreground">
              Saldo consignación: <span className={overLimit ? "font-medium text-destructive" : "text-foreground"}>{formatCurrency(consignmentBalance)}</span> / {formatCurrency(Number(creditTier.limit))}
            </span>
          </div>
        ) : (
          <p className="text-muted-foreground">Sin escalafón asignado — no puede recibir ventas a consignación.</p>
        )}
      </CardContent>
    </Card>
  );
}
