"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Check, X } from "@/components/icons";
import { cn } from "@/lib/utils";
import { apiJson, type ExpenseCategory } from "./types";

/**
 * Categorías de gasto: crear, renombrar, archivar. No se borran — los gastos
 * viejos siguen apuntando a la suya; archivada deja de aparecer al cargar.
 */
export function CategoriesTab({ categories, onChanged }: { categories: ExpenseCategory[]; onChanged: () => Promise<void> | void }) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await fn();
      await onChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!newName.trim()) return;
    const ok = await run(() => apiJson("/api/expenses/categories", { method: "POST", body: JSON.stringify({ name: newName }) }));
    if (ok) setNewName("");
  }

  async function rename(id: string) {
    const ok = await run(() => apiJson(`/api/expenses/categories/${id}`, { method: "PUT", body: JSON.stringify({ name: editName }) }));
    if (ok) setEditingId(null);
  }

  function toggleActive(c: ExpenseCategory) {
    run(() => apiJson(`/api/expenses/categories/${c.id}`, { method: "PUT", body: JSON.stringify({ active: !c.active }) }));
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nueva categoría" aria-label="Nombre de la nueva categoría" />
        <Button type="submit" disabled={busy || !newName.trim()}>
          <Plus className="h-4 w-4 mr-2" />
          Agregar
        </Button>
      </form>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {categories.map((c) => (
            <div key={c.id} className={cn("flex items-center gap-2 px-4 py-2.5", !c.active && "opacity-60")}>
              {editingId === c.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    rename(c.id);
                  }}
                >
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus aria-label="Nuevo nombre" />
                  <Button type="submit" size="icon" variant="ghost" aria-label="Guardar nombre" disabled={busy || !editName.trim()}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Cancelar" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 text-sm">{c.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {c._count?.expenses ?? 0} {(c._count?.expenses ?? 0) === 1 ? "gasto" : "gastos"}
                  </span>
                  {!c.active && <Badge variant="outline">Archivada</Badge>}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={`Renombrar ${c.name}`}
                    onClick={() => {
                      setEditingId(c.id);
                      setEditName(c.name);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(c)} disabled={busy}>
                    {c.active ? "Archivar" : "Reactivar"}
                  </Button>
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
