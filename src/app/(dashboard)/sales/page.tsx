"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, calcTax } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";
import { Plus, Trash2, AlertTriangle, Send, ChevronRight } from "lucide-react";
import { ContactSearchSelect, ProductSearchSelect } from "@/components/contact-search-select";

interface Sale {
  id: string;
  number: number;
  contact: { firstName: string; lastName: string; company: string | null };
  type: string;
  status: string;
  total: string;
  createdAt: string;
  payments: Array<{ amount: string }>;
}

interface Product { id: string; name: string; price: string; stock: number; }
interface Contact { id: string; firstName: string; lastName: string; company: string | null; cuit?: string | null; type: string; }

export default function SalesPageWrapper() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
      <SalesPage />
    </Suspense>
  );
}

function SalesPage() {
  const { format: formatCurrency } = useCurrency();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const preselectedContactId = searchParams.get("contactId") || "";
  const userRole = (session?.user?.role as string) || "OPERATOR";
  const isAdminUser = userRole === "ADMIN" || userRole === "SUPERADMIN";
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(!!preselectedContactId);
  const [form, setForm] = useState({
    contactId: preselectedContactId, type: "REGULAR",
    items: [{ productId: "", quantity: 1, unitPrice: 0 }] as Array<{ productId: string; quantity: number; unitPrice: number }>,
    discount: 0, notes: "", requiresFactura: false,
  });

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    setError("");
    try {
      const [salesRes, prodRes, leadsRes, clientsRes] = await Promise.all([
        fetch("/api/sales"), fetch("/api/products"), fetch("/api/leads"), fetch("/api/clients"),
      ]);
      if (salesRes.ok) setSales(await salesRes.json().then((d: Sale[]) => Array.isArray(d) ? d : []));
      else throw new Error(`No se pudieron cargar las ventas (Error ${salesRes.status})`);

      if (prodRes.ok) setProducts(await prodRes.json().then((d: Product[]) => Array.isArray(d) ? d : []));
      else setProducts([]);

      const leads = leadsRes.ok ? await leadsRes.json().then((d: Contact[]) => Array.isArray(d) ? d : []) : [];
      const clients = clientsRes.ok ? await clientsRes.json().then((d: Contact[]) => Array.isArray(d) ? d : []) : [];
      setContacts([...leads, ...clients]);
    } catch (err) {
      console.error("[sales] fetchAll", err);
      setSales([]);
      setProducts([]);
      setContacts([]);
      setError(err instanceof Error ? err.message : "No se pudieron cargar los datos de ventas");
    }
    finally { setLoading(false); }
  }

  function updateItem(idx: number, field: string, value: string | number) {
    const items = [...form.items];
    (items[idx] as Record<string, string | number>)[field] = value;
    if (field === "productId") {
      const p = products.find((p) => p.id === value);
      if (p) items[idx].unitPrice = parseFloat(p.price);
    }
    setForm({ ...form, items });
  }

  async function handleCreate() {
    const subtotal = form.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const tax = form.requiresFactura ? calcTax(subtotal) : 0;
    const total = subtotal - form.discount + tax;
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: form.contactId,
          type: form.type,
          items: form.items,
          discount: form.discount,
          notes: form.notes,
          requiresFactura: form.requiresFactura,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Error al crear venta");
      }
      setShowForm(false);
      setForm({ contactId: "", type: "REGULAR", items: [{ productId: "", quantity: 1, unitPrice: 0 }], discount: 0, notes: "", requiresFactura: false });
      fetchAll();
    } catch (err) {
      console.error("[sales] create", err);
      setError(err instanceof Error ? err.message : "Error al crear venta");
    }
  }

  // --- Operator: Notificar Venta form ---
  const [notifyForm, setNotifyForm] = useState({ contactName: "", description: "", amount: "" });
  const [notifySent, setNotifySent] = useState(false);

  async function handleNotifySale() {
    try {
      setError("");
      const res = await fetch("/api/sales/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName: notifyForm.contactName,
          description: notifyForm.description,
          amount: notifyForm.amount ? parseFloat(notifyForm.amount) : undefined,
        }),
      });
      if (!res.ok) throw new Error("Error al enviar notificación");
      setNotifySent(true);
      setNotifyForm({ contactName: "", description: "", amount: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  if (!isAdminUser) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Notificar Venta</h1>
        <p className="text-sm text-muted-foreground">Completá el formulario para notificar una posible venta a los administradores.</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notifySent && <p className="text-sm text-green-600">¡Notificación enviada correctamente!</p>}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label>Nombre del Cliente</Label>
              <Input value={notifyForm.contactName} onChange={(e) => setNotifyForm({ ...notifyForm, contactName: e.target.value })} placeholder="Nombre del cliente o empresa" />
            </div>
            <div>
              <Label>Descripción de la venta</Label>
              <Textarea value={notifyForm.description} onChange={(e) => setNotifyForm({ ...notifyForm, description: e.target.value })} placeholder="Qué productos, cantidades, detalles..." />
            </div>
            <div>
              <Label>Monto aproximado (opcional)</Label>
              <Input type="number" value={notifyForm.amount} onChange={(e) => setNotifyForm({ ...notifyForm, amount: e.target.value })} placeholder="0" />
            </div>
            <Button onClick={handleNotifySale} disabled={!notifyForm.contactName || !notifyForm.description}>
              <Send className="h-4 w-4 mr-2" />Enviar Notificación
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      {/* Loading overlay when navigating from client profile */}
      {preselectedContactId && loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
            <p className="text-sm text-muted-foreground">Cargando datos del cliente...</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold">Ventas</h1>
        <Button onClick={() => setShowForm(!showForm)} className="bg-orange-500 hover:bg-orange-600 text-white"><Plus className="h-4 w-4 mr-2" />Nueva Venta</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Crear Venta</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Contacto</Label>
                <ContactSearchSelect
                  contacts={contacts}
                  value={form.contactId}
                  onValueChange={(v) => setForm({ ...form, contactId: v })}
                  placeholder="Seleccionar"
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REGULAR">Regular</SelectItem>
                    <SelectItem value="CONSIGNMENT">Consignación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Productos</Label>
              {form.items.map((item, idx) => (
                <div key={idx} className="flex gap-2 mt-2">
                  <ProductSearchSelect
                    products={products}
                    value={item.productId}
                    onValueChange={(v) => updateItem(idx, "productId", v)}
                    placeholder="Seleccionar"
                    showPrice={false}
                    className="flex-1"
                  />
                  <Input type="number" className="w-20" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Math.max(1, parseInt(e.target.value) || 1))} min={1} />
                  <Input type="number" className="w-28" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)} />
                  <span className="flex items-center w-28 text-sm">{formatCurrency(item.quantity * item.unitPrice)}</span>
                  {form.items.length > 1 && <Button variant="ghost" size="icon" aria-label="Eliminar item" onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              ))}
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setForm({ ...form, items: [...form.items, { productId: "", quantity: 1, unitPrice: 0 }] })}><Plus className="h-4 w-4 mr-1" />Item</Button>
            </div>
            <div className="flex gap-4 items-end">
              <div><Label>Descuento</Label><Input type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: parseFloat(e.target.value) || 0 })} className="w-32" /></div>
              {(() => {
                const sub = form.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
                const tax = form.requiresFactura ? calcTax(sub) : 0;
                const total = sub - form.discount + tax;
                return (
                  <div className="space-y-1">
                    {form.requiresFactura && (
                      <p className="text-sm text-muted-foreground">Subtotal: {formatCurrency(sub - form.discount)} | IVA (21%): {formatCurrency(tax)}</p>
                    )}
                    <p className="text-lg font-bold">Total: {formatCurrency(total)}</p>
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="requiresFacturaSale"
                checked={form.requiresFactura}
                onChange={(e) => setForm({ ...form, requiresFactura: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="requiresFacturaSale">Requiere facturación</Label>
            </div>
            {!form.requiresFactura && (
              <div className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-600">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Los precios expresados en la lista no incluyen el IVA (21%).
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleCreate}>Crear Venta</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          {loading ? <p>Cargando...</p> : (
            <>
            {/* ── Vista móvil ── */}
            <div className="md:hidden space-y-2">
              {sales.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No hay ventas</p>}
              {sales.map((sale) => {
                const paid = sale.payments?.reduce((s, p) => s + parseFloat(p.amount), 0) || 0;
                const total = parseFloat(sale.total);
                return (
                  <div key={sale.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/sales/${sale.id}`)}>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="font-medium text-sm truncate">
                        <span className="font-mono text-[10px] text-muted-foreground mr-1.5">#{sale.number}</span>
                        {sale.contact?.company || `${sale.contact?.firstName ?? ""} ${sale.contact?.lastName ?? ""}`.trim()}
                      </p>
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant={sale.type === "CONSIGNMENT" ? "outline" : "default"} className="text-[10px] px-1.5 py-0">{sale.type === "CONSIGNMENT" ? "Consignación" : "Regular"}</Badge>
                        <Badge variant={paid >= total ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">{paid >= total ? "Pagado" : "Pendiente"}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{formatCurrency(sale.total)}</span>
                        <span>{formatDate(sale.createdAt)}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                );
              })}
            </div>

            {/* ── Vista desktop ── */}
            <div className="hidden md:block">
            <Table>
              <TableHeader><TableRow>
                <TableHead>#</TableHead><TableHead>Cliente</TableHead><TableHead>Tipo</TableHead><TableHead>Total</TableHead><TableHead>Pagado</TableHead><TableHead>Estado</TableHead><TableHead>Fecha</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {sales.map((sale) => {
                  const paid = sale.payments?.reduce((s, p) => s + parseFloat(p.amount), 0) || 0;
                  const total = parseFloat(sale.total);
                  return (
                    <TableRow key={sale.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/sales/${sale.id}`)}>
                      <TableCell>#{sale.number}</TableCell>
                      <TableCell>{sale.contact?.company || `${sale.contact?.firstName ?? ""} ${sale.contact?.lastName ?? ""}`.trim()}</TableCell>
                      <TableCell><Badge variant={sale.type === "CONSIGNMENT" ? "outline" : "default"}>{sale.type === "CONSIGNMENT" ? "Consignación" : "Regular"}</Badge></TableCell>
                      <TableCell>{formatCurrency(sale.total)}</TableCell>
                      <TableCell>{formatCurrency(paid)}</TableCell>
                      <TableCell><Badge variant={paid >= total ? "default" : "destructive"}>{paid >= total ? "Pagado" : "Pendiente"}</Badge></TableCell>
                      <TableCell>{formatDate(sale.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
                {sales.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No hay ventas</TableCell></TableRow>}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
