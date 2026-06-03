"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
}

interface StockMovement {
  id: string;
  type: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  referenceType: string | null;
  reason: string | null;
  createdAt: string;
  product: { id: string; name: string; sku: string | null; category: string };
  user: { id: string; name: string } | null;
}

const typeLabel: Record<string, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Ajuste",
  DEVOLUCION: "Devolución",
};

const typeBadgeVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ENTRADA: "default",
  SALIDA: "destructive",
  AJUSTE: "outline",
  DEVOLUCION: "secondary",
};

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ productId: "", type: "AJUSTE", quantity: "", reason: "" });
  const [saving, setSaving] = useState(false);

  const fetchMovements = async () => {
    setLoading(true);
    setError("");
    const url = filterType !== "ALL"
      ? `/api/stock-movements?type=${filterType}`
      : "/api/stock-movements";
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setMovements(await res.json());
    } catch (err) {
      console.error("[stock-movements] fetch", err);
      setMovements([]);
      setError("No se pudieron cargar los movimientos de stock.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovements();
    fetch("/api/products?active=true")
      .then((r) => (r.ok ? r.json() : []))
      .then(setProducts)
      .catch((err) => {
        console.error("[stock-movements] fetch products", err);
      });
  }, [filterType]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/stock-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Error al registrar movimiento");
      }
      await fetchMovements();
      setOpen(false);
      setForm({ productId: "", type: "AJUSTE", quantity: "", reason: "" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al registrar movimiento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Movimientos de Stock</h1>
          <p className="text-muted-foreground text-sm">Trazabilidad completa del inventario</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Ajuste manual
        </Button>
      </div>

      <div className="flex gap-2">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los tipos</SelectItem>
            <SelectItem value="ENTRADA">Entradas</SelectItem>
            <SelectItem value="SALIDA">Salidas</SelectItem>
            <SelectItem value="AJUSTE">Ajustes</SelectItem>
            <SelectItem value="DEVOLUCION">Devoluciones</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          {/* ── Vista móvil ── */}
          <div className="md:hidden space-y-2 p-4">
            {loading ? (
              <p className="text-center text-muted-foreground py-8 text-sm">Cargando...</p>
            ) : movements.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No hay movimientos registrados</p>
            ) : (
              movements.map((m) => (
                <div key={m.id} className="rounded-lg border px-3 py-2.5 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{m.product.name}</p>
                    <span className={`font-mono text-sm font-medium ${m.type === "SALIDA" ? "text-destructive" : "text-green-600"}`}>
                      {m.type === "SALIDA" ? "-" : "+"}{m.quantity}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant={typeBadgeVariant[m.type]} className="text-[10px] px-1.5 py-0">{typeLabel[m.type]}</Badge>
                    <span className="text-muted-foreground font-mono">{m.stockBefore} → {m.stockAfter}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{new Date(m.createdAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    {m.user?.name && <span>{m.user.name}</span>}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ── Vista desktop ── */}
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Stock antes</TableHead>
                <TableHead>Stock después</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Usuario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">Cargando...</TableCell>
                </TableRow>
              ) : movements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">No hay movimientos registrados</TableCell>
                </TableRow>
              ) : (
                movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">
                      {new Date(m.createdAt).toLocaleString("es-AR", {
                        day: "2-digit", month: "2-digit", year: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{m.product.name}</div>
                      {m.product.sku && <div className="text-xs text-muted-foreground">{m.product.sku}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={typeBadgeVariant[m.type]}>{typeLabel[m.type]}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      <span className={m.type === "SALIDA" ? "text-destructive" : "text-green-600"}>
                        {m.type === "SALIDA" ? "-" : "+"}{m.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono">{m.stockBefore}</TableCell>
                    <TableCell className="font-mono font-medium">{m.stockAfter}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.referenceType ?? "—"}</TableCell>
                    <TableCell className="text-sm max-w-32 truncate">{m.reason ?? "—"}</TableCell>
                    <TableCell className="text-sm">{m.user?.name ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajuste manual de stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Producto *</Label>
              <Select value={form.productId} onValueChange={(v) => setForm({ ...form, productId: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar producto" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.sku ? ` (${p.sku})` : ""} — Stock: {p.stock}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AJUSTE">Ajuste</SelectItem>
                    <SelectItem value="ENTRADA">Entrada</SelectItem>
                    <SelectItem value="SALIDA">Salida</SelectItem>
                    <SelectItem value="DEVOLUCION">Devolución</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Cantidad *</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Motivo</Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                rows={2}
                placeholder="Descripción del ajuste..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={saving || !form.productId || !form.quantity}
            >
              {saving ? "Registrando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
