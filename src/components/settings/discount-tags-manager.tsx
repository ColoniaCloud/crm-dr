"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";

interface DiscountTag {
  id: string;
  code: string;
  name: string;
  type: "PERCENTAGE" | "FIXED";
  value: string;
  active: boolean;
  _count: { contacts: number };
}

function describe(t: { type: string; value: string }) {
  const v = Number(t.value);
  return t.type === "FIXED" ? `$${v.toLocaleString("es-AR")}` : `${v}%`;
}

/**
 * Etiquetas de descuento (/settings, SUPERADMIN).
 *
 * Hermana de CreditTiersManager, con dos diferencias que vienen de qué hace
 * cada cosa:
 *
 *  - Acá se listan también las desactivadas, porque desactivar es la forma
 *    prevista de jubilar una etiqueta sin repreciar a nadie de golpe, y hay que
 *    poder volver a prenderla.
 *  - Acá sí se puede borrar. Borrar desasigna la etiqueta de todos los
 *    contactos que la tienen, así que esta pantalla pregunta primero con el
 *    número de clientes en la mano. La API además rechaza el borrado sin
 *    `?force=true` cuando hay contactos asignados, para que una llamada suelta
 *    no repricie a nadie de casualidad.
 *
 * Editar el valor no toca las ventas ya hechas: el descuento se calcula al crear
 * cada venta y queda escrito ahí.
 */
export function DiscountTagsManager() {
  const [tags, setTags] = useState<DiscountTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, { code: string; name: string; type: string; value: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [newValue, setNewValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Borrado: la etiqueta a confirmar y a cuántos contactos les saca el descuento.
  const [pendingDelete, setPendingDelete] = useState<{ tag: DiscountTag; contacts: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTags = async () => {
    setLoading(true);
    const res = await fetch("/api/discount-tags");
    if (res.ok) setTags(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchTags(); }, []);

  function draft(t: DiscountTag) {
    return edits[t.id] ?? { code: t.code, name: t.name, type: t.type, value: t.value };
  }

  function isDirty(t: DiscountTag) {
    const d = edits[t.id];
    return !!d && (d.code !== t.code || d.name !== t.name || d.type !== t.type || d.value !== t.value);
  }

  async function patchTag(id: string, body: Record<string, unknown>, onOk?: () => void) {
    setSaving(id);
    setError("");
    try {
      const res = await fetch(`/api/discount-tags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo guardar");
      onOk?.();
      fetchTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(null);
    }
  }

  async function saveTag(t: DiscountTag) {
    const d = draft(t);
    const valueNum = parseFloat(d.value);
    if (!d.code.trim() || !d.name.trim() || !Number.isFinite(valueNum) || valueNum <= 0) return;
    await patchTag(
      t.id,
      { code: d.code.trim().toUpperCase(), name: d.name.trim(), type: d.type, value: valueNum },
      () => setEdits((e) => { const n = { ...e }; delete n[t.id]; return n; })
    );
  }

  async function createTag() {
    const valueNum = parseFloat(newValue);
    if (!newCode.trim() || !newName.trim() || !Number.isFinite(valueNum) || valueNum <= 0) {
      setError("Completá código, nombre y un valor válido");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/discount-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode.trim().toUpperCase(), name: newName.trim(), type: newType, value: valueNum }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo crear la etiqueta");
      setNewCode(""); setNewName(""); setNewValue(""); setNewType("PERCENTAGE");
      fetchTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la etiqueta");
    } finally {
      setCreating(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/discount-tags/${pendingDelete.tag.id}?force=true`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo borrar la etiqueta");
      setPendingDelete(null);
      fetchTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar la etiqueta");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Etiquetas de descuento</CardTitle>
        <CardDescription>
          Descuento pactado por cliente. Se aplica solo al crear una venta, sobre el precio de lista de los
          productos. Cambiar el valor no toca las ventas ya hechas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Código (ej. A)" value={newCode} onChange={(e) => setNewCode(e.target.value)} className="w-28" />
          <Input placeholder="Nombre (ej. Mayorista)" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1 min-w-[10rem]" />
          <Select value={newType} onValueChange={(v) => setNewType(v as "PERCENTAGE" | "FIXED")}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PERCENTAGE">Porcentaje</SelectItem>
              <SelectItem value="FIXED">Monto fijo</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder={newType === "PERCENTAGE" ? "Valor (%)" : "Valor ($)"}
            type="number" min="0" step="0.01"
            value={newValue} onChange={(e) => setNewValue(e.target.value)} className="w-36"
          />
          <Button onClick={createTag} disabled={creating}>
            <Plus className="h-4 w-4 mr-2" />Agregar
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Clientes</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>
            ) : tags.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No hay etiquetas cargadas</TableCell></TableRow>
            ) : (
              tags.map((t) => {
                const d = draft(t);
                return (
                  <TableRow key={t.id} className={t.active ? undefined : "opacity-60"}>
                    <TableCell>
                      <Input
                        value={d.code}
                        onChange={(e) => setEdits((ed) => ({ ...ed, [t.id]: { ...d, code: e.target.value } }))}
                        className="h-8 w-24"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={d.name}
                        onChange={(e) => setEdits((ed) => ({ ...ed, [t.id]: { ...d, name: e.target.value } }))}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={d.type}
                        onValueChange={(v) => setEdits((ed) => ({ ...ed, [t.id]: { ...d, type: v } }))}
                      >
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PERCENTAGE">Porcentaje</SelectItem>
                          <SelectItem value="FIXED">Monto fijo</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number" min="0" step="0.01"
                          value={d.value}
                          onChange={(e) => setEdits((ed) => ({ ...ed, [t.id]: { ...d, value: e.target.value } }))}
                          className="h-8 w-28"
                        />
                        <span className="text-xs text-muted-foreground">{d.type === "FIXED" ? "$" : "%"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t._count.contacts}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {!t.active && <Badge variant="outline">Inactiva</Badge>}
                        {isDirty(t) ? (
                          <Button size="sm" onClick={() => saveTag(t)} disabled={saving === t.id}>
                            {saving === t.id ? "Guardando..." : "Guardar"}
                          </Button>
                        ) : (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => patchTag(t.id, { active: !t.active })}
                            disabled={saving === t.id}
                          >
                            {t.active ? "Desactivar" : "Activar"}
                          </Button>
                        )}
                        <Button
                          size="icon" variant="ghost" aria-label={`Borrar etiqueta ${t.code}`}
                          onClick={() => { setError(""); setPendingDelete({ tag: t, contacts: t._count.contacts }); }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <p className="text-xs text-muted-foreground">
          Desactivar una etiqueta deja de aplicar el descuento sin desasignarla: si se vuelve a activar, los
          clientes que la tienen lo recuperan. Borrarla la saca de todos los clientes y ya no vuelve.
        </p>
      </CardContent>

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrar la etiqueta {pendingDelete?.tag.code}?</DialogTitle>
            <DialogDescription>
              {pendingDelete && pendingDelete.contacts > 0 ? (
                <>
                  {pendingDelete.contacts}{" "}
                  {pendingDelete.contacts === 1 ? "cliente tiene" : "clientes tienen"} esta etiqueta
                  {pendingDelete.tag ? ` (${describe(pendingDelete.tag)})` : ""}. Si la borrás, en su próxima
                  compra pagan precio de lista. Las ventas ya hechas no se tocan.
                </>
              ) : (
                <>No hay clientes con esta etiqueta, así que borrarla no cambia ningún precio.</>
              )}
            </DialogDescription>
          </DialogHeader>
          {pendingDelete && pendingDelete.contacts > 0 && (
            <p className="text-sm text-muted-foreground">
              Si solo querés dejar de usarla, <strong>desactivala</strong> en vez de borrarla: se conserva la
              asignación y se puede volver atrás.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Borrando..." : "Borrar etiqueta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
