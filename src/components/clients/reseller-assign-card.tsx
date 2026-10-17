"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, Store } from "@/components/icons";
import { ResellerSelect, resellerName, type ResellerOption } from "@/components/clients/reseller-select";

/**
 * En la ficha de un Cliente: a qué revendedor pertenece (si es subcliente) y
 * la posibilidad de asignarlo, cambiarlo o dejarlo como cliente directo.
 */
export function ResellerAssignCard({
  clientId,
  reseller,
  onChanged,
}: {
  clientId: string;
  reseller: ResellerOption | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string | null>(reseller?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resellerId: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo guardar");
      }
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Revendedor</CardTitle>
            <CardDescription>{reseller ? "Es subcliente de este revendedor." : "Cliente directo de Kristall."}</CardDescription>
          </div>
          {!editing && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Cambiar revendedor"
              onClick={() => { setValue(reseller?.id ?? null); setEditing(true); }}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {editing ? (
          <>
            <ResellerSelect value={value} onChange={setValue} disabled={saving} />
            {error && <p className="text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
            </div>
          </>
        ) : reseller ? (
          <Link href={`/revendedores/${reseller.id}`} className="inline-flex items-center gap-2 font-medium text-primary hover:underline">
            <Store className="h-4 w-4" />
            {resellerName(reseller)}
          </Link>
        ) : (
          <p className="text-muted-foreground">Sin revendedor asignado.</p>
        )}
      </CardContent>
    </Card>
  );
}
