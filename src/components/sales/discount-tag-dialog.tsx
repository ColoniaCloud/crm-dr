"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";

export interface TagEditable {
  id: string;
  code: string;
  name: string;
  type: string;
  value: number;
  /** Cuántos contactos la tienen como etiqueta general. */
  usoContactos?: number;
  /** Cuántos acuerdos por producto la usan. */
  usoAcuerdos?: number;
}

/**
 * Crear o editar una etiqueta de descuento sin salir del formulario de venta.
 *
 * Existe porque el descuento se pacta en el momento: el vendedor está armando la
 * venta y recién ahí aparece que a este cliente se le acordó un 16,66% que no
 * está cargado. Mandarlo a Configuración y de vuelta le hace perder el carrito.
 *
 * ─── Editar NO es local a esta venta, y hay que decirlo ────────────────────
 *
 * Una etiqueta es un objeto compartido: la misma `KRY16` puede estar en la ficha
 * de cinco contactos y en veinte acuerdos por producto. Cambiarle el valor
 * cambia el precio de **las próximas ventas de todos ellos** — las ya hechas no
 * se mueven, porque cada venta guarda su propia copia legible.
 *
 * Por eso el diálogo muestra a cuántos alcanza antes de guardar. Sin ese número,
 * "editar este descuento" se lee como "cambiarlo para esta venta", que es
 * exactamente lo contrario de lo que hace.
 *
 * Si lo que se quiere es un precio distinto solo para esta venta, el camino es
 * el descuento a mano del pie del formulario; y si es para este cliente en este
 * producto, un acuerdo en su ficha.
 */
export function DiscountTagDialog({
  open,
  onOpenChange,
  tag,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null = crear una nueva. Con valor = editar esa. */
  tag: TagEditable | null;
  /** Recibe el id de la etiqueta creada o editada, para poder seleccionarla. */
  onSaved: (tagId: string) => void;
}) {
  const editando = tag !== null;
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Se resetea al abrir y no al cerrar: si se cierra con un error a la vista,
  // volver a abrir tiene que empezar limpio, y el estado del cierre no importa.
  useEffect(() => {
    if (!open) return;
    setError("");
    setCode(tag?.code ?? "");
    setName(tag?.name ?? "");
    setType((tag?.type as "PERCENTAGE" | "FIXED") ?? "PERCENTAGE");
    setValue(tag ? String(tag.value) : "");
  }, [open, tag]);

  const numero = Number(value.replace(",", "."));
  const valorValido = Number.isFinite(numero) && numero > 0;
  const porcentajeValido = type !== "PERCENTAGE" || numero <= 100;
  const alcance = (tag?.usoContactos ?? 0) + (tag?.usoAcuerdos ?? 0);

  async function guardar() {
    if (!code.trim() || !name.trim()) {
      setError("El código y el nombre son obligatorios");
      return;
    }
    if (!valorValido) {
      setError("El valor tiene que ser un número mayor que cero");
      return;
    }
    if (!porcentajeValido) {
      setError("Un porcentaje no puede pasar de 100");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        editando ? `/api/discount-tags/${tag!.id}` : "/api/discount-tags",
        {
          method: editando ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: code.trim().toUpperCase(),
            name: name.trim(),
            type,
            value: numero,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // El 403 merece su propio texto: crear y editar etiquetas es SUPERADMIN,
        // y "Error 403" no le dice a nadie qué hacer.
        throw new Error(
          res.status === 403
            ? "No tenés permiso para crear o editar etiquetas de descuento."
            : data.error || "No se pudo guardar"
        );
      }
      onSaved(data.id ?? tag?.id ?? "");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editando ? "Editar descuento" : "Crear descuento nuevo"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="dtCode">Código</Label>
              <Input
                id="dtCode"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="KRY16"
                maxLength={20}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="dtName">Nombre</Label>
              <Input
                id="dtName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Revendedor Kryon"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="dtType">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as "PERCENTAGE" | "FIXED")}>
                <SelectTrigger id="dtType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE">Porcentaje</SelectItem>
                  <SelectItem value="FIXED">Monto fijo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dtValue">
                {type === "PERCENTAGE" ? "Porcentaje (%)" : "Monto ($)"}
              </Label>
              <Input
                id="dtValue"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={type === "PERCENTAGE" ? "16.66" : "50000"}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {type === "PERCENTAGE"
              ? "Se descuenta ese porcentaje del precio de lista, en cada ítem que lleve esta etiqueta."
              : "Se descuenta ese monto en el ítem que lleve esta etiqueta, con tope en el total de esa línea."}
          </p>

          {/* El aviso solo cuando edita Y la etiqueta está en uso: en una recién
              creada o sin asignar no hay nada que advertir, y un cartel que
              siempre aparece deja de leerse. */}
          {editando && alcance > 0 && (
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                Esta etiqueta <strong>no es de esta venta</strong>: la usan{" "}
                {tag!.usoContactos ? (
                  <>
                    <strong>{tag!.usoContactos}</strong>{" "}
                    {tag!.usoContactos === 1 ? "contacto" : "contactos"}
                  </>
                ) : null}
                {tag!.usoContactos && tag!.usoAcuerdos ? " y " : null}
                {tag!.usoAcuerdos ? (
                  <>
                    <strong>{tag!.usoAcuerdos}</strong>{" "}
                    {tag!.usoAcuerdos === 1 ? "acuerdo por producto" : "acuerdos por producto"}
                  </>
                ) : null}
                . Cambiarla les cambia el precio a todos, de acá en adelante. Las ventas ya
                hechas no se mueven.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando..." : editando ? "Guardar cambios" : "Crear descuento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
