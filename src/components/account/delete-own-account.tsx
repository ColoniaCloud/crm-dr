"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Trash2 } from "@/components/icons";

/**
 * Eliminar la propia cuenta del CRM. La usan dos lugares: la pantalla de
 * Configuración y la página pública /eliminar-cuenta cuando la persona ya está
 * conectada (la misma pantalla, para que el link que se le da a Meta lleve
 * directo a esta acción).
 *
 * La baja es irreversible, así que pide la contraseña y que se escriba la
 * palabra ELIMINAR. Qué se borra y qué se conserva lo decide la API
 * (`/api/profile/delete-account`); el texto de abajo tiene que decir lo mismo.
 */
export function DeleteOwnAccount() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/profile/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo eliminar la cuenta");
        return;
      }
      // La sesión ya no es válida: se cierra y se vuelve al login.
      await signOut({ callbackUrl: "/login" });
    } catch {
      setError("No se pudo eliminar la cuenta. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Trash2 size={18} /> Eliminar mi cuenta
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-2 text-muted-foreground">
          <p>Al eliminar tu cuenta:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>dejás de poder ingresar al sistema y se cierran tus sesiones abiertas;</li>
            <li>se borran tu nombre, tu email y tu foto, y la casilla de correo conectada, si tenías una;</li>
            <li>se borran tus notificaciones.</li>
          </ul>
          <p>
            Las ventas, presupuestos y registros que hiciste son parte de la historia del negocio y se conservan, pero
            sin tus datos personales: aparecen a nombre de «Usuario eliminado». Esta acción no se puede deshacer.
          </p>
        </div>

        {!open ? (
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Quiero eliminar mi cuenta
          </Button>
        ) : (
          <form onSubmit={handleDelete} className="space-y-4 rounded-lg border border-destructive/30 p-4">
            <div className="flex items-start gap-2 text-destructive">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p className="font-medium">Para confirmar, ingresá tu contraseña y escribí ELIMINAR.</p>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="delete-password">Contraseña</Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="delete-confirm">Escribí ELIMINAR</Label>
              <Input
                id="delete-confirm"
                autoComplete="off"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => {
                  setOpen(false);
                  setPassword("");
                  setConfirm("");
                  setError("");
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={loading || confirm !== "ELIMINAR" || !password}>
                {loading ? "Eliminando..." : "Eliminar mi cuenta definitivamente"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
