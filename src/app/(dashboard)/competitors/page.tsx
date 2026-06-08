"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useCurrency } from "@/contexts/currency-context";
import { Plus, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

interface CompetitorProduct {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  shade: string | null;
  price: string;
  notes: string | null;
}

interface Competitor {
  id: string;
  name: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  products: CompetitorProduct[];
}

const categoryLabels: Record<string, string> = {
  AUTOMOTIVE: "Automotriz",
  ARCHITECTURAL: "Arquitectónico",
  PPF: "PPF",
};

export default function CompetitorsPage() {
  const { format: formatCurrency } = useCurrency();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showForm, setShowForm] = useState(false);
  const [addingProductFor, setAddingProductFor] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", website: "", phone: "", email: "", notes: "" });
  const [productForm, setProductForm] = useState({
    name: "", category: "AUTOMOTIVE", brand: "", shade: "", price: "", notes: "",
  });

  useEffect(() => { fetchCompetitors(); }, []);

  async function fetchCompetitors() {
    try {
      const res = await fetch("/api/competitors");
      const data = await res.json();
      setCompetitors(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    try {
      await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      setForm({ name: "", website: "", phone: "", email: "", notes: "" });
      fetchCompetitors();
    } catch (err) { console.error(err); }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este competidor?")) return;
    try {
      await fetch(`/api/competitors/${id}`, { method: "DELETE" });
      fetchCompetitors();
    } catch (err) { console.error(err); }
  }

  async function handleAddProduct(competitorId: string) {
    try {
      await fetch(`/api/competitors/${competitorId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...productForm, price: parseFloat(productForm.price) || 0 }),
      });
      setAddingProductFor(null);
      setProductForm({ name: "", category: "AUTOMOTIVE", brand: "", shade: "", price: "", notes: "" });
      fetchCompetitors();
    } catch (err) { console.error(err); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold">Competencia</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />Nuevo Competidor
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Agregar Competidor</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Sitio Web</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
              <div><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div><Label>Notas / Análisis</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex gap-2">
              <Button onClick={handleCreate}>Guardar</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : (
        <div className="space-y-4">
          {competitors.map((comp) => (
            <Card key={comp.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{comp.name}</CardTitle>
                    <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                      {comp.website && <span>{comp.website}</span>}
                      {comp.phone && <span>{comp.phone}</span>}
                      {comp.email && <span>{comp.email}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{comp.products?.length || 0} productos</Badge>
                    <Button variant="ghost" size="icon" aria-label="Expandir/colapsar" onClick={() => setExpanded({ ...expanded, [comp.id]: !expanded[comp.id] })}>
                      {expanded[comp.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Eliminar competidor" onClick={() => handleDelete(comp.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expanded[comp.id] && (
                <CardContent>
                  {comp.notes && <p className="text-sm text-gray-600 mb-4">{comp.notes}</p>}
                  {/* ── Vista móvil productos ── */}
                  <div className="md:hidden space-y-2">
                    {comp.products?.map((p) => (
                      <div key={p.id} className="rounded-lg border px-3 py-2 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm truncate">{p.name}</p>
                          <span className="font-medium text-sm">{formatCurrency(p.price)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{categoryLabels[p.category] || p.category}</Badge>
                          {p.brand && <span>{p.brand}</span>}
                          {p.shade && <span>{p.shade}</span>}
                        </div>
                      </div>
                    ))}
                    {(!comp.products || comp.products.length === 0) && (
                      <p className="text-center text-muted-foreground text-sm py-4">Sin productos cargados</p>
                    )}
                  </div>
                  {/* ── Vista desktop productos ── */}
                  <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Marca</TableHead>
                        <TableHead>Tonalidad</TableHead>
                        <TableHead>Precio</TableHead>
                        <TableHead>Notas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comp.products?.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.name}</TableCell>
                          <TableCell><Badge variant="outline">{categoryLabels[p.category] || p.category}</Badge></TableCell>
                          <TableCell>{p.brand || "-"}</TableCell>
                          <TableCell>{p.shade || "-"}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(p.price)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.notes || "-"}</TableCell>
                        </TableRow>
                      ))}
                      {(!comp.products || comp.products.length === 0) && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sin productos cargados</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                  </div>

                  <Separator className="my-4" />

                  {addingProductFor === comp.id ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg">
                      <div><Label>Producto</Label><Input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} /></div>
                      <div>
                        <Label>Categoría</Label>
                        <Select value={productForm.category} onValueChange={(v) => setProductForm({ ...productForm, category: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AUTOMOTIVE">Automotriz</SelectItem>
                            <SelectItem value="ARCHITECTURAL">Arquitectónico</SelectItem>
                            <SelectItem value="PPF">PPF</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>Marca</Label><Input value={productForm.brand} onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })} /></div>
                      <div><Label>Tonalidad</Label><Input value={productForm.shade} onChange={(e) => setProductForm({ ...productForm, shade: e.target.value })} /></div>
                      <div><Label>Precio (USD)</Label><Input type="number" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} /></div>
                      <div><Label>Notas</Label><Input value={productForm.notes} onChange={(e) => setProductForm({ ...productForm, notes: e.target.value })} /></div>
                      <div className="col-span-2 flex gap-2">
                        <Button size="sm" onClick={() => handleAddProduct(comp.id)}>Agregar</Button>
                        <Button size="sm" variant="outline" onClick={() => setAddingProductFor(null)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setAddingProductFor(comp.id)}>
                      <Plus className="h-4 w-4 mr-1" />Agregar Producto
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>
          ))}

          {competitors.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No hay competidores registrados</CardContent></Card>
          )}
        </div>
      )}
    </div>
  );
}
