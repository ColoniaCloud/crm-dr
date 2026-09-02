"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KeyRound, Mail, AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";

type AccessLevel = "BASIC" | "INSTALLER";

interface PortalAccountInfo {
  configured: boolean;
  email: string | null;
  enabled: boolean;
  lastLoginAt: string | null;
  accessLevel: AccessLevel | null;
  activatedAt: string | null;
  whatsapp: string | null;
  /** El cliente cargó en el portal un WhatsApp distinto al de la ficha. Decide el operador. */
  whatsappMismatch: { portal: string; crm: string; updatedAt: string | null } | null;
  contactEmail: string | null;
  canInvite: boolean;
}

interface ClientPortalAccessProps {
  clientId: string;
  clientEmail: string | null;
}

const LEVEL_LABEL: Record<AccessLevel, string> = {
  BASIC: "Panel Clientes",
  INSTALLER: "Portal Instalador",
};

/**
 * "Acceso al Portal" — tarjeta + diálogo para que un admin gestione el acceso de
 * un Cliente a kristallfilm.com.
 *
 * Dos niveles: `BASIC` ("Panel Clientes": compras y cuenta corriente) lo obtiene
 * cualquier Cliente que active su cuenta; `INSTALLER` (suma stock, garantías y
 * reclamos) lo habilita a mano un operador acá.
 */
export function ClientPortalAccess({ clientId, clientEmail }: ClientPortalAccessProps) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<PortalAccountInfo | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    enabled: true,
    accessLevel: "BASIC" as AccessLevel,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const res = await fetch(`/api/clients/${clientId}/portal-account`);
    if (!res.ok) throw new Error("No se pudo cargar el acceso al portal");
    const data: PortalAccountInfo = await res.json();
    setInfo(data);
    setForm({
      email: data.email || data.contactEmail || clientEmail || "",
      password: "",
      enabled: data.enabled ?? true,
      accessLevel: data.accessLevel ?? "BASIC",
    });
    return data;
  }

  // Carga al montar, para que la tarjeta muestre nivel y estado sin abrir el diálogo.
  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function openDialog() {
    setOpen(true);
    setError("");
    setNotice("");
    setLoading(true);
    try {
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el acceso al portal");
      setForm({ email: clientEmail || "", password: "", enabled: true, accessLevel: "BASIC" });
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
          accessLevel: form.accessLevel,
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

  /**
   * Le manda al cliente el mail para que se cree la contraseña él mismo.
   *
   * Va con el nivel que esté elegido arriba: si se invita como Portal
   * Instalador, el cliente activa y ya entra con ese nivel puesto. Antes la
   * invitación no llevaba nivel, todos activaban en Panel Clientes, y había que
   * acordarse de volver acá después a subirlo.
   */
  async function invitar() {
    setInviting(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessLevel: form.accessLevel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo enviar la invitación");
      setNotice(
        `Invitación enviada a ${data.sentTo} con nivel ${LEVEL_LABEL[form.accessLevel]}. ` +
          "El link vence en 24 h."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la invitación");
    } finally {
      setInviting(false);
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
        {info && (
          <CardContent className="pt-0 text-sm">
            {info.configured ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={info.enabled ? "default" : "secondary"}>
                  {info.enabled ? "Habilitado" : "Deshabilitado"}
                </Badge>
                {info.accessLevel && <Badge variant="outline">{LEVEL_LABEL[info.accessLevel]}</Badge>}
                {info.whatsappMismatch && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />WhatsApp distinto
                  </Badge>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Sin cuenta creada</p>
            )}
          </CardContent>
        )}
      </Card>

      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />Acceso al Portal de Clientes
            </DialogTitle>
            <DialogDescription>
              Habilita el acceso de este cliente en kristallfilm.com.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : (
            <div className="space-y-4">
              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
              )}
              {notice && (
                <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>
              )}

              {info?.whatsappMismatch && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium text-amber-900">
                    <AlertTriangle className="h-4 w-4" />El cliente cargó otro WhatsApp
                  </p>
                  <p className="mt-1 text-amber-800">
                    En el portal puso <strong>{info.whatsappMismatch.portal}</strong>; en la ficha
                    figura <strong>{info.whatsappMismatch.crm}</strong>. El del portal no pisa el de
                    la ficha — si el correcto es el nuevo, cambialo vos en los datos de contacto.
                  </p>
                </div>
              )}

              {info?.configured && (
                <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Último login: {info.lastLoginAt ? formatDate(info.lastLoginAt) : "nunca"}
                  {" · "}
                  {info.activatedAt
                    ? `Activada por el cliente el ${formatDate(info.activatedAt)}`
                    : "Invitada — el cliente todavía no eligió su contraseña, así que no puede entrar"}
                </div>
              )}

              {/* El nivel va ARRIBA de la invitación: es lo primero que hay que
                  decidir, porque la invitación se manda con el nivel puesto. */}
              <div className="space-y-1">
                <Label>Nivel de acceso</Label>
                <Select
                  value={form.accessLevel}
                  onValueChange={(v) => setForm({ ...form, accessLevel: v as AccessLevel })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BASIC">Panel Clientes — compras y cuenta corriente</SelectItem>
                    <SelectItem value="INSTALLER">
                      Portal Instalador — suma stock, garantías, reclamos y Mi Taller
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {info?.activatedAt
                    ? "Se aplica al guardar. El cliente lo ve la próxima vez que entre."
                    : "Elegilo antes de invitar: el cliente activa su cuenta ya con este nivel."}
                </p>
              </div>

              {/* Invitación: el cliente elige su propia contraseña */}
              {!info?.activatedAt && (
                <div className="rounded-md border p-3">
                  <p className="mb-2 text-sm font-medium">Invitar al cliente</p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Le manda un mail para que cree su contraseña él mismo, y la cuenta le queda con el
                    nivel elegido arriba. Es el camino recomendado: así no hay que pasarle una
                    contraseña por WhatsApp.
                  </p>
                  {info?.canInvite ? (
                    <Button size="sm" variant="outline" onClick={invitar} disabled={inviting}>
                      <Mail className="mr-1 h-4 w-4" />
                      {inviting
                        ? "Enviando…"
                        : `Invitar a ${info.contactEmail} como ${LEVEL_LABEL[form.accessLevel]}`}
                    </Button>
                  ) : (
                    <p className="text-xs text-destructive">
                      Este cliente no tiene email en la ficha. Cargalo primero para poder invitarlo.
                    </p>
                  )}
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
                <p className="text-xs text-muted-foreground">
                  Solo hace falta si le creás la cuenta a mano en vez de invitarlo.
                </p>
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
