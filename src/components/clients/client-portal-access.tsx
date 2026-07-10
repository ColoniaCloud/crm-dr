"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KeyRound } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface PortalAccountInfo {
  configured: boolean;
  email: string | null;
  enabled: boolean;
  lastLoginAt: string | null;
}

interface ClientPortalAccessProps {
  clientId: string;
  clientEmail: string | null;
}

/** "Acceso al Portal" card + dialog — lets an admin grant/configure a Cliente's login for kristallfilm.com. */
export function ClientPortalAccess({ clientId, clientEmail }: ClientPortalAccessProps) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<PortalAccountInfo | null>(null);
  const [form, setForm] = useState({ email: "", password: "", enabled: true });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function openDialog() {
    setOpen(true);
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-account`);
      if (!res.ok) throw new Error("No se pudo cargar el acceso al portal");
      const data: PortalAccountInfo = await res.json();
      setInfo(data);
      setForm({ email: data.email || clientEmail || "", password: "", enabled: data.enabled ?? true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el acceso al portal");
      setForm({ email: clientEmail || "", password: "", enabled: true });
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!form.email) {
      setError("El email es requerido");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-account`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          ...(form.password ? { password: form.password } : {}),
          enabled: form.enabled,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar el acceso al portal");
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el acceso al portal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />Acceso al Portal
          </CardTitle>
          <Button variant="outline" size="sm" onClick={openDialog}>
            Configurar
          </Button>
        </CardHeader>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />Acceso al Portal de Clientes
            </DialogTitle>
            <DialogDescription>
              Habilita el login de este cliente en kristallfilm.com. Solo un admin puede otorgar este acceso.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : (
            <div className="space-y-4">
              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
              )}
              {info?.configured && (
                <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Último login: {info.lastLoginAt ? formatDate(info.lastLoginAt) : "nunca"}
                </div>
              )}
              <div className="space-y-1">
                <Label>Email de acceso</Label>
                <Input
                  type="email"
                  placeholder="cliente@empresa.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Contraseña</Label>
                <Input
                  type="password"
                  placeholder={info?.configured ? "Dejar en blanco para no cambiarla" : "Mínimo 6 caracteres"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label className="text-sm">Habilitado</Label>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  className="h-4 w-4"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving || loading}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
