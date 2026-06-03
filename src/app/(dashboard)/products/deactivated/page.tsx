"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Package, Power, Trash2 } from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";

const CATEGORY_LABEL: Record<string, string> = {
  AUTOMOTIVE: "Automotriz",
  ARCHITECTURAL: "Arquitectónica",
  PPF: "PPF",
};

const CATEGORY_COLORS: Record<string, string> = {
  AUTOMOTIVE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  ARCHITECTURAL: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  PPF: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

interface Product {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  brand: string | null;
  shade: string | null;
  stock: number;
  price: number;
  imageUrl: string | null;
  _count: { units: number };
}

export default function DeactivatedProductsPage() {
  const { format: formatCurrency } = useCurrency();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  async function fetchProducts() {
    try {
      setLoading(true);
      const res = await fetch("/api/products?active=false");
      if (!res.ok) throw new Error();
      setProducts(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchProducts(); }, []);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === products.length
        ? new Set()
        : new Set(products.map((p) => p.id))
    );
  }, [products]);

  async function bulkActivate() {
    if (!confirm(`¿Reactivar ${selected.size} producto(s)?`)) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action: "activate" }),
      });
      if (!res.ok) throw new Error();
      setSelected(new Set());
      fetchProducts();
    } finally {
      setBulkLoading(false);
    }
  }

  async function bulkDelete() {
    if (!confirm(`¿Eliminar ${selected.size} producto(s) permanentemente? Esta acción no se puede deshacer.`)) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action: "delete" }),
      });
      if (!res.ok) throw new Error();
      setSelected(new Set());
      fetchProducts();
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/products">
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Volver a productos">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Productos Desactivados</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {products.length} producto{products.length !== 1 ? "s" : ""} desactivado{products.length !== 1 ? "s" : ""}
            </p>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selected.size} seleccionado{selected.size > 1 ? "s" : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={bulkActivate}
                  disabled={bulkLoading}
                  className="gap-1.5 text-green-500 border-green-500/30 hover:bg-green-500/10"
                >
                  <Power size={14} />
                  Reactivar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={bulkDelete}
                  disabled={bulkLoading}
                  className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <Trash2 size={14} />
                  Eliminar
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package size={40} className="mx-auto mb-3 opacity-40" />
              <p>No hay productos desactivados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={products.length > 0 && selected.size === products.length}
                        onCheckedChange={toggleAll}
                        aria-label="Seleccionar todos"
                      />
                    </TableHead>
                    <TableHead>Foto</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Subcategoría</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Precio</TableHead>
                    <TableHead>Unidades</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id} className={selected.has(product.id) ? "bg-muted/50" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(product.id)}
                          onCheckedChange={() => toggleOne(product.id)}
                          aria-label={`Seleccionar ${product.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.imageUrl} alt={product.name}
                            className="w-10 h-10 rounded-md object-cover border opacity-50" />
                        ) : (
                          <div className="w-10 h-10 rounded-md border bg-muted flex items-center justify-center opacity-50">
                            <Package size={16} className="text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-muted-foreground">{product.name}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs border-0 opacity-60 ${CATEGORY_COLORS[product.category] ?? ""}`}>
                          {CATEGORY_LABEL[product.category] ?? product.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{product.subcategory ?? "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{product.brand ?? "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{product.stock}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatCurrency(product.price)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{product._count.units}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
