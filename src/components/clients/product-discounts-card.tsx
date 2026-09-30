"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ProductSearchSelect } from "@/components/contact-search-select";
import { Tags, Trash2, AlertTriangle } from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";

interface TagInfo {
  id: string;
  code: string;
  name: string;
  type: string;
  value: number;
  active?: boolean;
}

interface Acuerdo {
  id: string;
  productId: string;
  productName: string;
  productSku: string | null;
  discountTag: TagInfo;
  label: string;
}

interface ProductOption {
  id: string;
  name: string;
  price: string;
  stock: number;
  category?: string;
}

interface Estado {
  acuerdos: Acuerdo[];
  etiquetaGeneral: (TagInfo & { label: string }) | null;
  modoAcuerdos: boolean;
  apagaEtiquetaGeneral: boolean;
}

function describeValue(tag: { type: string; value: number }, formatCurrency: (n: number) => string) {
  return tag.type === "FIXED" ? formatCurrency(tag.value) : `${tag.value}%`;
}

/**
 * Descuentos pactados producto por producto.
 *
 * Es lo que permite pactar 16,66% en una lámina y nada en las otras dos — algo
 * que la etiqueta general (`DiscountTagCard`, al lado) no puede expresar porque
 * es una sola para toda la venta.
 *
 * ─── Los dos modos son excluyentes, y la pantalla tiene que decirlo ─────────
 *
 * Un contacto con **al menos un** acuerdo deja de usar su etiqueta general
 * **para todo**, no solo para los productos con acuerdo. Así que esta tarjeta y
 * la de al lado no se suman: una apaga a la otra.
 *
 * De ahí las dos cosas que hace este componente y que no son decorativas:
 *
 *   1. **Avisa antes de guardar el primer acuerdo** de un contacto que tiene
 *      etiqueta general activa. Es la operación que le cambia el precio de todo
 *      lo demás sin que se note en ninguna pantalla.
 *   2. **Dice explícitamente que la etiqueta general está guardada pero no se
 *      aplica**, para que nadie la busque pensando que se borró. Quitar el último
 *      acuerdo la devuelve — por eso nunca se borra desde acá.
 *
 * El descuento **no** se calcula en esta pantalla ni en el formulario: lo resuelve
 * el servidor al crear cada venta (`resolveSaleDiscount`), que es lo que hace que
 * también valga para las ventas que entran por el POS del vendedor en ruta.
 */
export function ProductDiscountsCard({
  clientId,
  canEdit,
  onChanged,
}: {
  clientId: string;
  canEdit: boolean;
  onChanged?: () => void;
}) {
  const { format: formatCurrency } = useCurrency();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [nuevoProducto, setNuevoProducto] = useState("");
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  /** El acuerdo pendiente de confirmar, cuando guardarlo apaga la etiqueta general. */
  const [confirmar, setConfirmar] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/product-discounts`);
      if (res.ok) setEstado(await res.json());
    } catch {
      /* la tarjeta queda vacía; el resto de la ficha sigue andando */
    }
  }, [clientId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    // Solo las activas: pactar una etiqueta desactivada es cargar un acuerdo que
    // no descuenta nada, y el endpoint lo rechaza igual.
    fetch("/api/discount-tags")
      .then((r) => (r.ok ? r.json() : []))
      .then((all: TagInfo[]) =>
        setTags(
          Array.isArray(all)
            ? all.filter((t) => t.active !== false).map((t) => ({ ...t, value: Number(t.value) }))
            : []
        )
      )
      .catch(() => {});
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((all: ProductOption[]) => setProducts(Array.isArray(all) ? all : []))
      .catch(() => {});
  }, []);

  async function guardar() {
    if (!nuevoProducto || !nuevaEtiqueta) return;
    // El aviso solo la primera vez: del segundo acuerdo en adelante la etiqueta
    // general ya estaba apagada y no hay nada nuevo que avisar.
    if (estado?.apagaEtiquetaGeneral && !confirmar) {
      setConfirmar(true);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${clientId}/product-discounts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: nuevoProducto, discountTagId: nuevaEtiqueta }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo guardar");
      setNuevoProducto("");
      setNuevaEtiqueta("");
      setConfirmar(false);
      await cargar();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function quitar(productId: string) {
    setError("");
    try {
      const res = await fetch(
        `/api/clients/${clientId}/product-discounts?productId=${encodeURIComponent(productId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo quitar");
      await cargar();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar");
    }
  }

  const acuerdos = estado?.acuerdos ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Tags className="h-4 w-4" />
          Descuentos pactados por producto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* El estado del contacto, arriba y en una línea: es lo primero que hay
            que entender antes de tocar cualquier cosa de esta tarjeta. */}
        {estado?.modoAcuerdos ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="font-medium">Este contacto trabaja con acuerdos por producto.</p>
            <p className="mt-1 text-muted-foreground">
              Los productos que no figuran abajo se le venden a{" "}
              <strong className="text-foreground">precio de lista</strong>.
              {estado.etiquetaGeneral && (
                <>
                  {" "}Su etiqueta general (<Badge variant="outline">{estado.etiquetaGeneral.code}</Badge>{" "}
                  {describeValue(estado.etiquetaGeneral, formatCurrency)}) queda guardada pero{" "}
                  <strong className="text-foreground">no se aplica</strong> mientras haya acuerdos
                  cargados. Si se quitan todos, vuelve sola.
                </>
              )}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Sin acuerdos por producto.{" "}
            {estado?.etiquetaGeneral
              ? "Se le aplica su etiqueta general a todas las líneas de la venta."
              : "Se le vende a precio de lista."}
          </p>
        )}

        {acuerdos.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {acuerdos.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.productSku ? `${a.productSku} · ` : ""}
                    {a.label}
                    {a.discountTag.active === false && (
                      <span className="text-destructive"> · etiqueta desactivada, no descuenta</span>
                    )}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar el descuento de ${a.productName}`}
                    onClick={() => quitar(a.productId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="space-y-2 border-t border-border pt-3">
            <ProductSearchSelect
              products={products}
              value={nuevoProducto}
              onValueChange={setNuevoProducto}
              placeholder="Elegir producto"
              showPrice
              showStock={false}
              formatCurrency={(v) => formatCurrency(Number(v))}
            />
            <Select value={nuevaEtiqueta} onValueChange={setNuevaEtiqueta}>
              <SelectTrigger>
                <SelectValue placeholder="Elegir etiqueta" />
              </SelectTrigger>
              <SelectContent>
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

            {confirmar && estado?.etiquetaGeneral && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p>
                  Este es el primer acuerdo de este contacto, así que{" "}
                  <strong>deja de recibir {estado.etiquetaGeneral.label}</strong> en todos los productos
                  que no tengan acuerdo — se le van a vender a precio de lista. La etiqueta no se borra:
                  si después se quitan todos los acuerdos, vuelve a aplicarse.
                </p>
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button size="sm" onClick={guardar} disabled={saving || !nuevoProducto || !nuevaEtiqueta}>
                {saving ? "Guardando..." : confirmar ? "Sí, pactar igual" : "Pactar descuento"}
              </Button>
              {confirmar && (
                <Button size="sm" variant="ghost" onClick={() => setConfirmar(false)}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
