"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Cobertura {
  aplica: boolean;
  stock?: number;
  rollosLibres?: number;
  rollosTotales?: number;
  faltantes?: number;
  unidadesSinRollo?: number;
}

/**
 * Compara el stock de un producto con los rollos de garantía que lo respaldan.
 *
 * Para un producto con garantía, cada unidad en stock **es** un rollo físico.
 * Cuando esos dos números no coinciden hay unidades vendibles que no le van a
 * mostrar ningún rollo al Cliente en su panel — y hasta el hallazgo P-6 eso no
 * se veía por ningún lado: la venta se cerraba bien y el Cliente preguntaba
 * después.
 *
 * La cantidad a generar se pide y no se aplica sola a propósito. Apretar este
 * botón es **afirmar que esos rollos existen en el depósito**, y eso lo sabe
 * quien los mira, no el sistema. Se propone el número que falta; confirmarlo es
 * del operador.
 */
export function WarrantyRollCoverage({ productId }: { productId: string }) {
  const [cobertura, setCobertura] = useState<Cobertura | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState("");

  async function cargar() {
    try {
      const res = await fetch(`/api/products/${productId}/warranty-rolls`);
      if (!res.ok) return;
      const data: Cobertura = await res.json();
      setCobertura(data);
      if (data.faltantes && data.faltantes > 0) setCantidad(String(data.faltantes));
    } catch {
      /* si falla, la tarjeta simplemente no se muestra */
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function generar() {
    const n = Number(cantidad);
    if (!Number.isInteger(n) || n <= 0) {
      setError("Poné cuántos rollos generar");
      return;
    }
    setGenerando(true);
    setError("");
    setListo("");
    try {
      const res = await fetch(`/api/products/${productId}/warranty-rolls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cantidad: n }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron generar los rollos");
      setListo(
        data.vinculados > 0
          ? `Se generaron ${data.creados} rollo(s), ${data.vinculados} vinculado(s) a unidades que ya existían.`
          : `Se generaron ${data.creados} rollo(s).`
      );
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron generar los rollos");
    } finally {
      setGenerando(false);
    }
  }

  // Sin garantía habilitada no hay nada que conciliar.
  if (!cobertura?.aplica) return null;
  const faltantes = cobertura.faltantes ?? 0;

  if (faltantes <= 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        Rollos de garantía al día: {cobertura.rollosLibres} libres para {cobertura.stock} en stock.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-4">
      <div className="flex items-start gap-2 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
        <div>
          <p className="font-medium text-yellow-700">Faltan {faltantes} rollo(s) de garantía</p>
          <p className="mt-1 text-muted-foreground">
            El stock dice <strong>{cobertura.stock}</strong> unidades y hay{" "}
            <strong>{cobertura.rollosLibres}</strong> rollo(s) de garantía libres. Las unidades sin
            rollo se pueden vender, pero el Cliente no las va a ver en el Stock de su panel y no van
            a generar garantía.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Rollos a generar</Label>
          <Input
            type="number"
            min="1"
            className="h-9 w-28"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={generar} disabled={generando}>
          {generando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Generar
        </Button>
      </div>

      {(cobertura.unidadesSinRollo ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          Hay <strong>{cobertura.unidadesSinRollo}</strong> unidad(es) con código de trazabilidad sin
          garantía — pasa cuando se generan los códigos antes de configurarle la garantía al producto.
          Los rollos nuevos se les van a vincular automáticamente.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Generalos solo si esos rollos existen de verdad en el depósito. Esto no cambia el stock —
        crea los códigos de garantía que le faltan al stock que ya tenés.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {listo && <p className="text-sm text-emerald-700">{listo}</p>}
    </div>
  );
}
