"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Plus, Trash2, PackageCheck } from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  stock: number;
}

interface PurchaseOrderItem {
  id: string;
  productId: string;
  product: Product;
  quantity: number;
  costFOB: string;
  costLanded: string | null;
  notes: string | null;
}

interface ImportCost {
  id: string;
  type: string;
  description: string | null;
  amountARS: string;
}

interface Supplier {
  id: string;
  name: string;
  currency: string;
  country: string | null;
}

interface PurchaseOrder {
  id: string;
  number: number;
  status: string;
  currency: string;
  exchangeRate: string | null;
  orderDate: string;
  expectedDate: string | null;
  receivedDate: string | null;
  notes: string | null;
  supplier: Supplier;
  items: PurchaseOrderItem[];
  importCosts: ImportCost[];
}

const statusLabel: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  CONFIRMED: "Confirmada",
  RECEIVED: "Recibida",
};

const importCostLabels: Record<string, string> = {
  FLETE_INTERNACIONAL: "Flete internacional",
  DESPACHO_ADUANA: "Despacho de aduana",
  ARANCELES: "Aranceles e impuestos",
  FLETE_LOCAL: "Flete local",
  OTRO: "Otro",
};

export default function PurchaseOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { format: formatCurrency } = useCurrency();
  const id = params.id as string;

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [receiving, setReceiving] = useState(false);

  // Edit state
  const [status, setStatus] = useState("DRAFT");
  const [exchangeRate, setExchangeRate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [importCosts, setImportCosts] = useState<{ type: string; description: string; amountARS: string }[]>([]);

  const isNew = id === "new";

  const [newOrderForm, setNewOrderForm] = useState({
    supplierId: "",
    currency: "USD",
    exchangeRate: "",
    orderDate: new Date().toISOString().split("T")[0],
    expectedDate: "",
    notes: "",
  });
  const [newItems, setNewItems] = useState<{ productId: string; quantity: string; costFOB: string; notes: string }[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const fetchOrder = async () => {
    if (isNew) { setLoading(false); return; }
    setLoading(true);
    const res = await fetch(`/api/purchase-orders/${id}`);
    if (res.ok) {
      const data = await res.json();
      setOrder(data);
      setStatus(data.status);
      setExchangeRate(data.exchangeRate ?? "");
      setExpectedDate(data.expectedDate ? data.expectedDate.split("T")[0] : "");
      setNotes(data.notes ?? "");
      setImportCosts(data.importCosts.map((c: ImportCost) => ({
        type: c.type,
        description: c.description ?? "",
        amountARS: c.amountARS,
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    Promise.all([
      fetchOrder(),
      fetch("/api/products?active=true").then(r => r.ok ? r.json() : []).then(setProducts),
      isNew ? fetch("/api/suppliers").then(r => r.ok ? r.json() : []).then(setSuppliers) : Promise.resolve(),
    ]);
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/purchase-orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, exchangeRate, expectedDate, notes, importCosts }),
    });
    if (res.ok) {
      const data = await res.json();
      setOrder(data);
      setImportCosts(data.importCosts.map((c: ImportCost) => ({
        type: c.type,
        description: c.description ?? "",
        amountARS: c.amountARS,
      })));
    }
    setSaving(false);
  };

  const handleCreate = async () => {
    setSaving(true);
    const res = await fetch("/api/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newOrderForm, items: newItems }),
    });
    if (res.ok) {
      const data = await res.json();
      router.replace(`/purchase-orders/${data.id}`);
    }
    setSaving(false);
  };

  const handleReceive = async () => {
    if (!confirm("¿Confirmar recepción? Esto actualizará el stock y los costos de los productos.")) return;
    setReceiving(true);
    const res = await fetch(`/api/purchase-orders/${id}/receive`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setOrder(data);
      setStatus(data.status);
    }
    setReceiving(false);
  };

  const addImportCost = () => {
    setImportCosts([...importCosts, { type: "FLETE_INTERNACIONAL", description: "", amountARS: "" }]);
  };

  const removeImportCost = (i: number) => {
    setImportCosts(importCosts.filter((_, idx) => idx !== i));
  };

  const addNewItem = () => {
    setNewItems([...newItems, { productId: "", quantity: "1", costFOB: "", notes: "" }]);
  };

  const removeNewItem = (i: number) => {
    setNewItems(newItems.filter((_, idx) => idx !== i));
  };

  if (loading) {
    return <div className="p-6 text-muted-foreground">Cargando...</div>;
  }

  // NEW ORDER FORM
  if (isNew) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Volver a órdenes de compra" onClick={() => router.push("/purchase-orders")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Nueva Orden de Compra</h1>
        </div>

        <Card>
          <CardHeader><CardTitle>Datos generales</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Proveedor *</Label>
                <Select value={newOrderForm.supplierId} onValueChange={(v) => setNewOrderForm({ ...newOrderForm, supplierId: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Moneda</Label>
                <Select value={newOrderForm.currency} onValueChange={(v) => setNewOrderForm({ ...newOrderForm, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="ARS">ARS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Fecha de orden</Label>
                <DatePicker value={newOrderForm.orderDate} onChange={(v) => setNewOrderForm({ ...newOrderForm, orderDate: v })} />
              </div>
              <div className="space-y-1">
                <Label>ETA estimada</Label>
                <DatePicker value={newOrderForm.expectedDate} onChange={(v) => setNewOrderForm({ ...newOrderForm, expectedDate: v })} />
              </div>
              <div className="space-y-1">
                <Label>Tipo de cambio (USD→ARS)</Label>
                <Input type="number" step="0.01" value={newOrderForm.exchangeRate} onChange={(e) => setNewOrderForm({ ...newOrderForm, exchangeRate: e.target.value })} placeholder="Ej: 1050" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notas</Label>
              <Textarea value={newOrderForm.notes} onChange={(e) => setNewOrderForm({ ...newOrderForm, notes: e.target.value })} rows={2} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Productos</CardTitle>
            <Button variant="outline" size="sm" onClick={addNewItem}>
              <Plus className="h-4 w-4 mr-1" /> Agregar
            </Button>
          </CardHeader>
          <CardContent>
            {newItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Agregá productos a la orden
              </p>
            ) : (
              <div className="space-y-3">
                {newItems.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5 space-y-1">
                      <Label className="text-xs">Producto</Label>
                      <Select value={item.productId} onValueChange={(v) => {
                        const updated = [...newItems];
                        updated[i] = { ...updated[i], productId: v };
                        setNewItems(updated);
                      }}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        <SelectContent>
                          {products.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Cantidad</Label>
                      <Input type="number" min="1" value={item.quantity} onChange={(e) => {
                        const updated = [...newItems];
                        updated[i] = { ...updated[i], quantity: e.target.value };
                        setNewItems(updated);
                      }} />
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Costo FOB ({newOrderForm.currency})</Label>
                      <Input type="number" step="0.01" value={item.costFOB} onChange={(e) => {
                        const updated = [...newItems];
                        updated[i] = { ...updated[i], costFOB: e.target.value };
                        setNewItems(updated);
                      }} placeholder="0.00" />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Button size="icon" variant="ghost" aria-label="Eliminar item" onClick={() => removeNewItem(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => router.push("/purchase-orders")}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={saving || !newOrderForm.supplierId || newItems.length === 0}>
            {saving ? "Creando..." : "Crear orden"}
          </Button>
        </div>
      </div>
    );
  }

  if (!order) {
    return <div className="p-6 text-muted-foreground">Orden no encontrada</div>;
  }

  const totalFOB = order.items.reduce((sum, i) => sum + Number(i.costFOB) * i.quantity, 0);
  const totalImportCostsARS = order.importCosts.reduce((sum, c) => sum + Number(c.amountARS), 0);
  const exchangeRateNum = order.exchangeRate ? Number(order.exchangeRate) : 0;
  const totalFOBinARS = totalFOB * exchangeRateNum;
  const totalLanded = totalFOBinARS + totalImportCostsARS;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Volver a órdenes de compra" onClick={() => router.push("/purchase-orders")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">OC #{order.number}</h1>
            <p className="text-muted-foreground text-sm">{order.supplier.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={order.status === "RECEIVED" ? "default" : "secondary"}>
            {statusLabel[order.status]}
          </Badge>
          {order.status !== "RECEIVED" && (
            <>
              <Button onClick={handleSave} disabled={saving} variant="outline">
                {saving ? "Guardando..." : "Guardar cambios"}
              </Button>
              <Button onClick={handleReceive} disabled={receiving}>
                <PackageCheck className="h-4 w-4 mr-2" />
                {receiving ? "Procesando..." : "Marcar recibida"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total FOB ({order.currency})</p>
            <p className="text-xl font-bold font-mono">
              {totalFOB.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Gastos de importación (ARS)</p>
            <p className="text-xl font-bold font-mono">{formatCurrency(totalImportCostsARS)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Landed (ARS)</p>
            <p className="text-xl font-bold font-mono text-primary">
              {exchangeRateNum > 0 ? formatCurrency(totalLanded) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Estado y fechas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Estado</Label>
              <Select value={status} onValueChange={setStatus} disabled={order.status === "RECEIVED"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Borrador</SelectItem>
                  <SelectItem value="SENT">Enviada al proveedor</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmada</SelectItem>
                  <SelectItem value="RECEIVED">Recibida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tipo de cambio (USD→ARS)</Label>
              <Input
                type="number"
                step="0.01"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                disabled={order.status === "RECEIVED"}
                placeholder="Ej: 1050"
              />
            </div>
            <div className="space-y-1">
              <Label>ETA estimada</Label>
              <DatePicker
                value={expectedDate}
                onChange={(v) => setExpectedDate(v)}
                disabled={order.status === "RECEIVED"}
              />
            </div>
            <div className="space-y-1">
              <Label>Notas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={order.status === "RECEIVED"}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Gastos de importación</CardTitle>
            {order.status !== "RECEIVED" && (
              <Button variant="outline" size="sm" onClick={addImportCost}>
                <Plus className="h-4 w-4 mr-1" /> Agregar
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {importCosts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">Sin gastos cargados</p>
            ) : (
              importCosts.map((c, i) => (
                <div key={i} className="space-y-2 p-3 border rounded-md">
                  <div className="flex items-center justify-between">
                    <Select value={c.type} onValueChange={(v) => {
                      const updated = [...importCosts];
                      updated[i] = { ...updated[i], type: v };
                      setImportCosts(updated);
                    }} disabled={order.status === "RECEIVED"}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(importCostLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {order.status !== "RECEIVED" && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Eliminar costo de importación" onClick={() => removeImportCost(i)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Monto ARS"
                    value={c.amountARS}
                    onChange={(e) => {
                      const updated = [...importCosts];
                      updated[i] = { ...updated[i], amountARS: e.target.value };
                      setImportCosts(updated);
                    }}
                    disabled={order.status === "RECEIVED"}
                  />
                </div>
              ))
            )}
            {importCosts.length > 0 && (
              <>
                <Separator />
                <div className="flex justify-between text-sm font-medium">
                  <span>Total gastos</span>
                  <span>{formatCurrency(importCosts.reduce((sum, c) => sum + (parseFloat(c.amountARS) || 0), 0))}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Productos en la orden</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Costo FOB ({order.currency})</TableHead>
                <TableHead>Total FOB</TableHead>
                <TableHead>Costo Landed/u (ARS)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.product.name}</TableCell>
                  <TableCell className="font-mono text-xs">{item.product.sku ?? "—"}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell className="font-mono">
                    {Number(item.costFOB).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="font-mono">
                    {(Number(item.costFOB) * item.quantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="font-mono">
                    {item.costLanded
                      ? formatCurrency(Number(item.costLanded))
                      : exchangeRateNum > 0
                      ? (() => {
                          const itemFOBTotal = Number(item.costFOB) * item.quantity;
                          const proRataFactor = totalFOB > 0 ? itemFOBTotal / totalFOB : 0;
                          const importCostShare = totalImportCostsARS * proRataFactor;
                          const landed = Number(item.costFOB) * exchangeRateNum + importCostShare / item.quantity;
                          return <span className="text-muted-foreground">{formatCurrency(landed)} est.</span>;
                        })()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
