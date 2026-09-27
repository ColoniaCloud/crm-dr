"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tag } from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";

interface DiscountTagInfo {
  id: string;
  code: string;
  name: string;
  type: string;
  value: string;
  active: boolean;
}

interface DiscountTagCardProps {
  clientId: string;
  discountTag: DiscountTagInfo | null;
  canEdit: boolean;
  onChanged?: () => void;
}

/** Valor sin ambigüedad: `20%` o `$50.000`. */
function describeValue(tag: { type: string; value: string }, formatCurrency: (n: number) => string) {
  const v = Number(tag.value);
  return tag.type === "FIXED" ? formatCurrency(v) : `${v}%`;
}

/**
 * Etiqueta de descuento del Cliente.
 *
 * Va pegada a CreditTierCard porque las dos contestan preguntas de la misma
 * conversación —cuánto le fiamos, a qué precio le vendemos— pero son
 * independientes: tener etiqueta no habilita consignación ni al revés.
 *
 * El descuento **no** se aplica acá ni en el formulario: se calcula en el
 * servidor al crear cada venta (src/lib/discount-tags.ts), que es lo que hace
 * que también valga para las ventas que entran por el POS del vendedor.
 *
 * `null` en el selector desasigna: el cliente vuelve a precio de lista.
 */
export function DiscountTagCard({ clientId, discountTag, canEdit, onChanged }: DiscountTagCardProps) {
  const { format: formatCurrency } = useCurrency();
  const [tags, setTags] = useState<DiscountTagInfo[]>([]);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(discountTag?.id ?? "NONE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/discount-tags")
      .then((r) => (r.ok ? r.json() : []))
      // Las inactivas se listan para /settings; acá no se pueden elegir.
      .then((all: DiscountTagInfo[]) => setTags(Array.isArray(all) ? all.filter((t) => t.active) : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setSelected(discountTag?.id ?? "NONE");
  }, [discountTag?.id]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discountTagId: selected === "NONE" ? null : selected }),
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Tag className="h-4 w-4" />Etiqueta de descuento
        </CardTitle>
        {canEdit && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {discountTag ? "Cambiar" : "Asignar"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {editing ? (
          <div className="space-y-2">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger><SelectValue placeholder="Elegir etiqueta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Sin etiqueta (precio de lista)</SelectItem>
                {tags.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.code} — {t.name} ({describeValue(t, formatCurrency)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tags.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No hay etiquetas activas. Se crean en Configuración.
              </p>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setSelected(discountTag?.id ?? "NONE"); }}>Cancelar</Button>
            </div>
          </div>
        ) : discountTag ? (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{discountTag.code} — {discountTag.name}</Badge>
              <span className="font-medium">{describeValue(discountTag, formatCurrency)} de descuento</span>
            </div>
            <p className="text-muted-foreground">
              {discountTag.active
                ? discountTag.type === "FIXED"
                  ? "Se descuenta ese monto del total de cada venta nueva."
                  : "Se descuenta ese porcentaje del precio de lista en cada venta nueva."
                : "La etiqueta está desactivada: por ahora se le vende a precio de lista."}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">Sin etiqueta — se le vende a precio de lista.</p>
        )}
      </CardContent>
    </Card>
  );
}
