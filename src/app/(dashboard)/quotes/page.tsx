"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, calcTax } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";
import { Plus, FileText, Trash2, Download, Send, Mail, AlertTriangle, ChevronRight } from "lucide-react";
import { downloadQuotePDF, getQuotePDFBase64 } from "@/components/quote-pdf";
import type { QuotePDFData } from "@/components/quote-pdf";
import { ContactSearchSelect, ProductSearchSelect } from "@/components/contact-search-select";
import Link from "next/link";

interface Quote {
  id: string;
  number: number;
  contact: { id: string; firstName: string; lastName: string; company: string | null; email: string | null; address: string | null; city: string | null; state: string | null };
  total: string;
  subtotal: string;
  discount: string;
  tax: string;
  requiresFactura: boolean;
  status: string;
  sentAt: string | null;
  createdAt: string;
  items: Array<{ product: { name: string; category?: string }; quantity: number; unitPrice: string; total: string; discount: string; discountType: string }>;
}

interface Product {
  id: string;
  name: string;
  price: string;
  stock: number;
  category: string;
}

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  cuit?: string | null;
  type: string;
}

const statusColors: Record<string, string> = {
  DRAFT: "secondary",
  SENT: "default",
  ACCEPTED: "default",
  REJECTED: "destructive",
  CONVERTED: "outline",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviado",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado",
  CONVERTED: "Convertido",
};

function QuotesPageInner() {
  const { format: formatCurrency } = useCurrency();
  const searchParams = useSearchParams();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(!!searchParams.get("contactId"));
  const [form, setForm] = useState({
    contactId: searchParams.get("contactId") || "",
    items: [{ productId: "", quantity: 1, unitPrice: 0, discount: 0, discountType: "FIXED" as "FIXED" | "PERCENT" }] as Array<{ productId: string; quantity: number; unitPrice: number; discount: number; discountType: "FIXED" | "PERCENT" }>,
    notes: "",
    requiresFactura: false,
  });
  const [createError, setCreateError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchQuotes();
    fetchProducts();
    fetchContacts();
  }, []);

  async function fetchQuotes() {
    try {
      const res = await fetch("/api/quotes");
      if (!res.ok) throw new Error("Error al cargar presupuestos");
      const data = await res.json();
      setQuotes(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function fetchProducts() {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) return;
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
  }

  async function fetchContacts() {
    try {
      const [leadsRes, clientsRes] = await Promise.all([
        fetch("/api/leads"),
        fetch("/api/clients"),
      ]);
      const leads = leadsRes.ok ? await leadsRes.json() : [];
      const clients = clientsRes.ok ? await clientsRes.json() : [];
      setContacts([...(Array.isArray(leads) ? leads : []), ...(Array.isArray(clients) ? clients : [])]);
    } catch (err) { console.error(err); }
  }

  function addItem() {
    setForm({ ...form, items: [...form.items, { productId: "", quantity: 1, unitPrice: 0, discount: 0, discountType: "FIXED" as "FIXED" | "PERCENT" }] });
  }

  function removeItem(index: number) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  }

  function updateItem(index: number, field: string, value: string | number) {
    const items = [...form.items];
    (items[index] as Record<string, string | number>)[field] = value;
    if (field === "productId") {
      const product = products.find((p) => p.id === value);
      if (product) items[index].unitPrice = parseFloat(product.price);
    }
    setForm({ ...form, items });
  }

  function computeItemTotal(item: { quantity: number; unitPrice: number; discount: number; discountType: "FIXED" | "PERCENT" }) {
    const lineTotal = item.quantity * item.unitPrice;
    if (item.discount <= 0) return lineTotal;
    const discountAmount = item.discountType === "PERCENT" ? lineTotal * (item.discount / 100) : item.discount;
    return lineTotal - discountAmount;
  }

  async function handleCreate(andSend = false) {
    setCreateError("");
    const sub = form.items.reduce((s, i) => s + computeItemTotal(i), 0);
    const tax = form.requiresFactura ? calcTax(sub) : 0;
    const total = sub + tax;
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: form.contactId,
          items: form.items.filter((i) => i.productId).map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discount: i.discount,
            discountType: i.discountType,
          })),
          subtotal: sub,
          tax,
          total,
          notes: form.notes,
          requiresFactura: form.requiresFactura,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Error al crear presupuesto");
      }
      const created = await res.json();

      if (andSend) {
        setSending(true);
        try {
          const pdfData: QuotePDFData = {
            number: created.number,
            createdAt: created.createdAt,
            contact: created.contact,
            subtotal: sub,
            discount: 0,
            total,
            tax,
            requiresFactura: form.requiresFactura,
            notes: form.notes || null,
            items: created.items.map((it: { product: { name: string; category?: string }; quantity: number; unitPrice: string | number; total: string | number; discount: string | number; discountType: string }) => ({
              product: it.product,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              total: it.total,
              discount: Number(it.discount),
              discountType: it.discountType,
            })),
          };
          const pdfBase64 = await getQuotePDFBase64(pdfData);
          const sendRes = await fetch(`/api/quotes/${created.id}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pdfBase64 }),
          });
          if (!sendRes.ok) {
            const data = await sendRes.json().catch(() => null);
            throw new Error(data?.error || "Error al enviar por email");
          }
        } catch (err) {
          setCreateError(err instanceof Error ? err.message : "Presupuesto creado pero error al enviar email");
        } finally {
          setSending(false);
        }
      }

      setShowForm(false);
      setForm({ contactId: "", items: [{ productId: "", quantity: 1, unitPrice: 0, discount: 0, discountType: "FIXED" }], notes: "", requiresFactura: false });
      fetchQuotes();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Error al crear presupuesto");
    }
  }

  async function handleDownloadQuote(q: Quote) {
    await downloadQuotePDF({
      number: q.number,
      createdAt: q.createdAt,
      contact: q.contact,
      subtotal: q.subtotal,
      discount: q.discount,
      total: q.total,
      tax: q.tax,
      requiresFactura: q.requiresFactura,
      items: q.items.map((i) => ({
        product: i.product,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.total,
        discount: Number(i.discount),
        discountType: i.discountType,
      })),
    });
  }

  const subtotal = form.items.reduce((s, i) => s + computeItemTotal(i), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold">Presupuestos</h1>
        <Button onClick={() => setShowForm(!showForm)} className="bg-orange-500 hover:bg-orange-600 text-white">
          <Plus className="h-4 w-4 mr-2" />Nuevo Presupuesto
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Crear Presupuesto</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Contacto</Label>
              <ContactSearchSelect
                contacts={contacts}
                value={form.contactId}
                onValueChange={(v) => setForm({ ...form, contactId: v })}
                placeholder="Seleccionar contacto"
                showType
              />
            </div>

            <div>
              <Label>Productos</Label>
              <div className="flex flex-wrap gap-2 mt-2 items-end">
                <span className="flex-1 min-w-[180px] text-xs font-medium text-muted-foreground">Producto</span>
                <span className="w-20 text-xs font-medium text-muted-foreground">Cantidad</span>
                <span className="w-28 text-xs font-medium text-muted-foreground">Precio Unit.</span>
                <span className="w-[6.5rem] text-xs font-medium text-muted-foreground">Descuento</span>
                <span className="w-28 text-xs font-medium text-muted-foreground">Total</span>
                <span className="w-10" />
              </div>
              {form.items.map((item, idx) => (
                <div key={idx} className="flex flex-wrap gap-2 mt-2 items-end">
                  <ProductSearchSelect
                    products={products}
                    value={item.productId}
                    onValueChange={(v) => updateItem(idx, "productId", v)}
                    formatCurrency={formatCurrency}
                    placeholder="Seleccionar producto"
                    className="flex-1 min-w-[180px]"
                  />
                  <Input type="number" className="w-20" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Math.max(1, parseInt(e.target.value) || 1))} min={1} placeholder="Cant" />
                  <Input type="number" className="w-28" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)} placeholder="Precio" />
                  <div className="flex gap-1 items-center">
                    <Input type="number" className="w-20" value={item.discount} onChange={(e) => updateItem(idx, "discount", parseFloat(e.target.value) || 0)} min={0} placeholder="Dto" />
                    <Select value={item.discountType} onValueChange={(v) => updateItem(idx, "discountType", v)}>
                      <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FIXED">$</SelectItem>
                        <SelectItem value="PERCENT">%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="flex items-center w-28 text-sm">{formatCurrency(computeItemTotal(item))}</span>
                  {form.items.length > 1 && (
                    <Button variant="ghost" size="icon" aria-label="Eliminar item" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" className="mt-2" onClick={addItem}><Plus className="h-4 w-4 mr-1" />Agregar Item</Button>
            </div>

            {createError && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{createError}</div>}

            <div className="flex gap-4 items-end flex-wrap">
              {(() => {
                const tax = form.requiresFactura ? calcTax(subtotal) : 0;
                const total = subtotal + tax;
                return (
                  <div className="space-y-1">
                    {form.requiresFactura && (
                      <p className="text-sm text-muted-foreground">Subtotal: {formatCurrency(subtotal)} | IVA (21%): {formatCurrency(tax)}</p>
                    )}
                    <div className="text-lg font-bold">Total: {formatCurrency(total)}</div>
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="requiresFactura"
                checked={form.requiresFactura}
                onChange={(e) => setForm({ ...form, requiresFactura: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="requiresFactura">Requiere facturación</Label>
            </div>
            {!form.requiresFactura && (
              <div className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-600">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Los precios expresados en la lista no incluyen el IVA (21%).
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={() => handleCreate(false)} disabled={sending}>Guardar</Button>
              <Button variant="default" onClick={() => handleCreate(true)} disabled={sending}>
                <Send className="h-4 w-4 mr-1" />{sending ? "Enviando..." : "Guardar y Enviar"}
              </Button>
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
              {quotes.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No hay presupuestos</p>}
              {quotes.map((quote) => (
                <Link key={quote.id} href={`/quotes/${quote.id}`} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/50">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="font-medium text-sm truncate">
                      <span className="font-mono text-[10px] text-muted-foreground mr-1.5">#{quote.number}</span>
                      {quote.contact?.company || `${quote.contact?.firstName ?? ""} ${quote.contact?.lastName ?? ""}`.trim()}
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant={statusColors[quote.status] as "default" | "secondary" | "destructive" | "outline"} className="text-[10px] px-1.5 py-0">
                        {statusLabels[quote.status] || quote.status}
                      </Badge>
                      {quote.sentAt ? (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 gap-0.5"><Mail className="h-2.5 w-2.5" />Enviado</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">No enviado</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{formatCurrency(quote.total)}</span>
                      <span>{quote.items?.length || 0} items</span>
                      <span>{formatDate(quote.createdAt)}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              ))}
            </div>

            {/* ── Vista desktop ── */}
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Enviado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell>#{quote.number}</TableCell>
                    <TableCell>{quote.contact?.company || `${quote.contact?.firstName ?? ""} ${quote.contact?.lastName ?? ""}`.trim()}</TableCell>
                    <TableCell>{quote.items?.length || 0} items</TableCell>
                    <TableCell>{formatCurrency(quote.total)}</TableCell>
                    <TableCell>
                      <Badge variant={statusColors[quote.status] as "default" | "secondary" | "destructive" | "outline"}>
                        {statusLabels[quote.status] || quote.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {quote.sentAt ? (
                        <Badge variant="default" className="gap-1"><Mail className="h-3 w-3" />Enviado</Badge>
                      ) : (
                        <Badge variant="secondary">No enviado</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(quote.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Link href={`/quotes/${quote.id}`}>
                          <Button variant="ghost" size="sm"><FileText className="h-4 w-4" /></Button>
                        </Link>
                        <Button variant="ghost" size="sm" onClick={() => handleDownloadQuote(quote)} title="Descargar PDF">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {quotes.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No hay presupuestos</TableCell></TableRow>
                )}
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

export default function QuotesPage() {
  return (
    <Suspense>
      <QuotesPageInner />
    </Suspense>
  );
}
