"use client";

import { useState } from "react";
import Link from "next/link";
import { Globe, Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Preview {
  catalogGeneratedAt: string | null;
  totalInWeb: number;
  alreadyInCrm: string[];
  missing: { sku: string; name: string; category: string; subcategory: string | null }[];
}

const CATEGORY_LABEL: Record<string, string> = { AUTOMOTIVE: "Automotriz", ARCHITECTURAL: "Arquitectura" };

/**
 * "Importar del catálogo web": compara kristallfilm.com contra los productos del
 * CRM y da de alta los que faltan, inactivos y sin precio. Primero muestra qué
 * va a crear; nada se escribe hasta confirmar.
 */
export function ImportWebCatalog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [createdCount, setCreatedCount] = useState<number | null>(null);

  async function openDialog() {
    setOpen(true);
    setPreview(null);
    setError("");
    setCreatedCount(null);
    setLoading(true);
    try {
      const res = await fetch("/api/products/import-web", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) setError(data.error || "No se pudo leer el catálogo web");
      else setPreview(data);
    } catch {
      setError("No se pudo leer el catálogo web");
    } finally {
      setLoading(false);
    }
  }

  async function runImport() {
    setImporting(true);
    setError("");
    try {
      const res = await fetch("/api/products/import-web", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo importar");
        return;
      }
      setCreatedCount(data.created.length);
      onImported();
    } catch {
      setError("No se pudo importar");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={openDialog} className="gap-2">
        <Globe size={16} />
        <span className="hidden sm:inline">Importar del catálogo web</span>
        <span className="sm:hidden">Importar</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar del catálogo web</DialogTitle>
            <DialogDescription>
              Productos publicados en kristallfilm.com cuyo código no existe como SKU en el CRM. Se crean con
              stock 0, precio 0 e <strong>inactivos</strong>: cargales el precio y activalos desde su ficha.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> Comparando con la web…
            </div>
          )}

          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

          {createdCount !== null ? (
            <div className="space-y-2 py-2 text-sm">
              <p>
                {createdCount === 0
                  ? "No hizo falta crear nada: alguien los cargó mientras tanto."
                  : `Se crearon ${createdCount} producto${createdCount === 1 ? "" : "s"}, inactivos y sin precio.`}
              </p>
              {createdCount > 0 && (
                <Link href="/products/deactivated" className="text-primary underline">
                  Verlos en productos dados de baja
                </Link>
              )}
            </div>
          ) : preview && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                La web tiene {preview.totalInWeb} productos; {preview.alreadyInCrm.length} ya están en el CRM.
              </p>
              {preview.missing.length === 0 ? (
                <p className="font-medium">El CRM ya tiene todos los productos de la web.</p>
              ) : (
                <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
                  {preview.missing.map((m) => (
                    <li key={m.sku} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate">{m.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        <span className="font-mono">{m.sku}</span> · {CATEGORY_LABEL[m.category] ?? m.category}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {createdCount !== null ? "Cerrar" : "Cancelar"}
            </Button>
            {createdCount === null && preview && preview.missing.length > 0 && (
              <Button onClick={runImport} disabled={importing} className="gap-2">
                {importing && <Loader2 size={16} className="animate-spin" />}
                Crear {preview.missing.length} producto{preview.missing.length === 1 ? "" : "s"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
