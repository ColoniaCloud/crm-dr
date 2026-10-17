"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/searchable-select";
import { AR_PROVINCES, AR_CITIES } from "@/lib/argentina-geo";
import { ResellerSelect } from "@/components/clients/reseller-select";

const EMPTY_FORM = {
  firstName: "", lastName: "", company: "", sector: "",
  email: "", phone: "", whatsapp: "", address: "", city: "", state: "", cuit: "", notes: "",
};

/**
 * Alta de un Cliente. La usan dos pantallas:
 *
 * - **Clientes → Nuevo Cliente**: el revendedor es opcional y se elige acá.
 * - **Ficha de un revendedor → Crear subcliente**: llega `fixedReseller` y el
 *   cliente nace asignado a él, sin poder cambiarlo desde este formulario.
 *
 * En los dos casos lo que se crea es un cliente normal (type CLIENT).
 */
export function ClientCreateDialog({
  open,
  onOpenChange,
  onCreated,
  fixedReseller,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  fixedReseller?: { id: string; name: string };
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          sector: form.sector || null,
          resellerId: fixedReseller?.id ?? resellerId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al crear cliente");
      }
      setForm(EMPTY_FORM);
      setResellerId(null);
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear cliente");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fixedReseller ? "Crear subcliente" : "Crear Nuevo Cliente"}</DialogTitle>
          {fixedReseller && (
            <DialogDescription>
              Se crea como cliente, asignado al revendedor <strong>{fixedReseller.name}</strong>.
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Apellido *</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Empresa</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Rubro</Label>
              <Select value={form.sector || undefined} onValueChange={(v) => setForm({ ...form, sector: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO_TALLER">Auto - Taller</SelectItem>
                  <SelectItem value="AUTO_CONCESIONARIO">Auto - Concesionario</SelectItem>
                  <SelectItem value="AUTO_MAYORISTA">Auto - Mayorista</SelectItem>
                  <SelectItem value="ARQUITECTURA_CONSTRUCTORA">Arquitectura - Constructora</SelectItem>
                  <SelectItem value="ARQUITECTURA_VIDRIERIA">Arquitectura - Vidriería</SelectItem>
                  <SelectItem value="ARQUITECTURA_MAYORISTA">Arquitectura - Mayorista</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {!fixedReseller && (
            <div className="space-y-1">
              <Label>Revendedor</Label>
              <ResellerSelect value={resellerId} onChange={setResellerId} />
              <p className="text-xs text-muted-foreground">Si le compra a un revendedor, queda como su subcliente.</p>
            </div>
          )}
          <div className="space-y-1">
            <Label>Dirección</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Av. Ejemplo 1234" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Provincia</Label>
              <SearchableSelect
                options={AR_PROVINCES}
                value={form.state}
                onValueChange={(v) => setForm({ ...form, state: v, city: "" })}
                placeholder="Seleccionar..."
                searchPlaceholder="Buscar provincia..."
              />
            </div>
            <div className="space-y-1">
              <Label>Ciudad</Label>
              <SearchableSelect
                options={AR_CITIES[form.state] ?? []}
                value={form.city}
                onValueChange={(v) => setForm({ ...form, city: v })}
                placeholder={form.state ? "Seleccionar..." : "Elegí provincia"}
                searchPlaceholder="Buscar ciudad..."
                disabled={!form.state}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>WhatsApp</Label>
            <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+54 9 11 XXXX-XXXX" />
          </div>
          <div className="space-y-1">
            <Label>CUIT</Label>
            <Input value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })} placeholder="XX-XXXXXXXX-X" />
          </div>
          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={creating}>
              {creating ? "Creando..." : fixedReseller ? "Crear subcliente" : "Crear Cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
