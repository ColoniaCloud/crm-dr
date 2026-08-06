"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";

interface CreditTier {
  id: string;
  code: string;
  name: string;
  limit: string;
  active: boolean;
  _count: { contacts: number };
}

/**
 * Escalafones de crédito para ventas a consignación (/settings, SUPERADMIN).
 * Los 4 iniciales (A-D) vienen del seed — acá solo se editan nombre/límite
 * de los que ya existen, o se agregan nuevos. `code` no se puede cambiar una
 * vez creado (ver PATCH /api/credit-tiers/[id]).
 */
export function CreditTiersManager() {
  const [tiers, setTiers] = useState<CreditTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, { name: string; limit: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const fetchTiers = async () => {
    setLoading(true);
    const res = await fetch("/api/credit-tiers");
    if (res.ok) setTiers(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchTiers(); }, []);

  function draft(t: CreditTier) {
    return edits[t.id] ?? { name: t.name, limit: t.limit };
  }

  function isDirty(t: CreditTier) {
    const d = edits[t.id];
    return !!d && (d.name !== t.name || d.limit !== t.limit);
  }

  async function saveTier(t: CreditTier) {
    const d = draft(t);
    const limitNum = parseFloat(d.limit);
    if (!d.name.trim() || !Number.isFinite(limitNum) || limitNum <= 0) return;
    setSaving(t.id);
    setError("");
    try {
      const res = await fetch(`/api/credit-tiers/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: d.name.trim(), limit: limitNum }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo guardar");
      setEdits((e) => { const n = { ...e }; delete n[t.id]; return n; });
      fetchTiers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(null);
    }
  }

  async function createTier() {
    const limitNum = parseFloat(newLimit);
    if (!newCode.trim() || !newName.trim() || !Number.isFinite(limitNum) || limitNum <= 0) {
      setError("Completá código, nombre y un límite válido");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/credit-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode.trim().toUpperCase(), name: newName.trim(), limit: limitNum }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo crear el escalafón");
      setNewCode(""); setNewName(""); setNewLimit("");
      fetchTiers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el escalafón");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Escalafones de crédito</CardTitle>
        <CardDescription>Límites para ventas a consignación (libres o en cuotas) por cliente</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Código (ej. E)" value={newCode} onChange={(e) => setNewCode(e.target.value)} className="w-28" />
          <Input placeholder="Nombre" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1 min-w-[10rem]" />
          <Input placeholder="Límite ($)" type="number" min="1" value={newLimit} onChange={(e) => setNewLimit(e.target.value)} className="w-40" />
          <Button onClick={createTier} disabled={creating}>
            <Plus className="h-4 w-4 mr-2" />Agregar
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Límite ($)</TableHead>
              <TableHead>Clientes</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>
            ) : tiers.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No hay escalafones cargados</TableCell></TableRow>
            ) : (
              tiers.map((t) => {
                const d = draft(t);
                return (
                  <TableRow key={t.id}>
                    <TableCell><Badge variant="outline">{t.code}</Badge></TableCell>
                    <TableCell>
                      <Input
                        value={d.name}
                        onChange={(e) => setEdits((ed) => ({ ...ed, [t.id]: { ...d, name: e.target.value } }))}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="1"
                        value={d.limit}
                        onChange={(e) => setEdits((ed) => ({ ...ed, [t.id]: { ...d, limit: e.target.value } }))}
                        className="h-8 w-36"
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t._count.contacts}</TableCell>
                    <TableCell>
                      {isDirty(t) && (
                        <Button size="sm" onClick={() => saveTier(t)} disabled={saving === t.id}>
                          {saving === t.id ? "Guardando..." : "Guardar"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
