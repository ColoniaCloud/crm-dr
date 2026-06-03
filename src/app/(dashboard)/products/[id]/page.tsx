"use client";

import { useState, useEffect, useRef, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft, Package, Sparkles, Plus, Trash2, Send, QrCode, Check, ImagePlus,
  Pencil, DollarSign, Layers, Tag, BarChart3, Info,
} from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";
import { UserSearchSelect } from "@/components/user-search-select";

// ── Constants ─────────────────────────────────────────────────────────────────
const SUBCATEGORIES: Record<string, { value: string; label: string }[]> = {
  AUTOMOTIVE: [
    { value: "PREMIUM", label: "Premium" },
    { value: "NANOCERAMIC", label: "Nanoceramic" },
    { value: "NANOCARBON", label: "Nanocarbon" },
    { value: "SAFETY", label: "Safety" },
    { value: "PPF", label: "PPF" },
  ],
  ARCHITECTURAL: [
    { value: "SOLAR", label: "Solar" },
    { value: "DECORATIVE", label: "Decorativa" },
    { value: "SAFETY", label: "Safety" },
    { value: "FROSTED", label: "Esmerilada" },
  ],
  PPF: [
    { value: "GLOSS", label: "Gloss" },
    { value: "MATTE", label: "Matte" },
    { value: "SATIN", label: "Satin" },
  ],
};

const SHADE_OPTIONS = Array.from({ length: 15 }, (_, i) => {
  const val = String((i + 1) * 5).padStart(2, "0");
  return { value: val, label: `${val}%` };
});

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

// ── Types ─────────────────────────────────────────────────────────────────────
interface Discount {
  id?: string;
  type: "FIXED" | "PERCENTAGE";
  value: number;
  label: string;
}

interface PriceTier {
  id?: string;
  tierType: "PACK" | "VOLUME";
  minQty: number;
  price: number;
}

interface ProductUnit {
  id: string;
  code: string;
  assignedToId: string | null;
  assignedTo: { id: string; name: string; email: string } | null;
  assignedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface ProductDetail {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  brand: string | null;
  shade: string | null;
  stock: number;
  minStock: number;
  price: number;
  cost: number | null;
  description: string | null;
  imageUrl: string | null;
  active: boolean;
  discounts: Discount[];
  units: ProductUnit[];
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { format: formatCurrency } = useCurrency();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN";
  const { id } = use(params);
  const router = useRouter();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", category: "AUTOMOTIVE", subcategory: "", brand: "",
    shade: "", stock: "0", minStock: "0", price: "", cost: "", description: "", imageUrl: "",
  });
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [improvingDesc, setImprovingDesc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Units
  const [users, setUsers] = useState<UserOption[]>([]);
  const [addUnitsOpen, setAddUnitsOpen] = useState(false);
  const [unitsQty, setUnitsQty] = useState("1");
  const [addingUnits, setAddingUnits] = useState(false);
  const [newCodes, setNewCodes] = useState<string[]>([]);

  // Assign modal
  const [assignUnit, setAssignUnit] = useState<ProductUnit | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assigning, setAssigning] = useState(false);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  async function fetchProduct() {
    try {
      setLoading(true);
      const res = await fetch(`/api/products/${id}`);
      if (!res.ok) throw new Error("Producto no encontrado");
      const data: ProductDetail = await res.json();
      setProduct(data);
      populateForm(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function populateForm(data: ProductDetail) {
    setForm({
      name: data.name,
      category: data.category,
      subcategory: data.subcategory ?? "",
      brand: data.brand ?? "",
      shade: data.shade ?? "",
      stock: String(data.stock),
      minStock: String(data.minStock),
      price: String(data.price),
      cost: data.cost != null ? String(data.cost) : "",
      description: data.description ?? "",
      imageUrl: data.imageUrl ?? "",
    });
    setDiscounts(data.discounts.map((d) => ({ ...d, value: Number(d.value), label: d.label ?? "" })));
    const rawTiers = (data as ProductDetail & { priceTiers?: PriceTier[] }).priceTiers ?? [];
    setPriceTiers(rawTiers.map((t) => ({ ...t, price: Number(t.price) })));
    if (data.imageUrl) setImagePreview(data.imageUrl);
  }

  async function fetchUsers() {
    try {
      const res = await fetch("/api/users");
      if (res.ok) setUsers(await res.json());
    } catch { /* silent */ }
  }

  useEffect(() => { fetchProduct(); fetchUsers(); }, [id]);

  function openEditModal() {
    if (product) populateForm(product);
    setEditOpen(true);
  }

  // ── Save product ────────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          subcategory: form.subcategory || null,
          brand: form.brand || null,
          shade: form.shade || null,
          stock: parseInt(form.stock) || 0,
          minStock: parseInt(form.minStock) || 0,
          price: parseFloat(form.price) || 0,
          cost: form.cost ? parseFloat(form.cost) : null,
          description: form.description || null,
          imageUrl: form.imageUrl || null,
          discounts: discounts.filter((d) => d.value > 0),
          priceTiers: priceTiers.filter((t) => t.price > 0 && t.minQty > 0),
        }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setSaveOk(true);
      setTimeout(() => { setSaveOk(false); setEditOpen(false); }, 1200);
      fetchProduct();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  // ── Image (crop & resize to 750×750) ──────────────────────────────────────
  function processImageFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const img = new Image();
    img.onload = () => {
      const size = 750;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      const b64 = canvas.toDataURL("image/jpeg", 0.85);
      setForm((f) => ({ ...f, imageUrl: b64 }));
      setImagePreview(b64);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  }

  // ── AI description ──────────────────────────────────────────────────────────
  async function improveDescription() {
    setImprovingDesc(true);
    try {
      const res = await fetch("/api/ai/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description,
          productName: form.name,
          category: CATEGORY_LABEL[form.category],
          subcategory: form.subcategory,
          shade: form.shade,
          brand: form.brand,
        }),
      });
      const json = await res.json();
      if (res.ok && json.description) setForm((f) => ({ ...f, description: json.description }));
    } catch { /* silent */ }
    finally { setImprovingDesc(false); }
  }

  // ── Discounts ───────────────────────────────────────────────────────────────
  function addDiscount() { setDiscounts((d) => [...d, { type: "PERCENTAGE", value: 0, label: "" }]); }
  function removeDiscount(idx: number) { setDiscounts((d) => d.filter((_, i) => i !== idx)); }
  function updateDiscount(idx: number, patch: Partial<Discount>) {
    setDiscounts((d) => d.map((item, i) => i === idx ? { ...item, ...patch } : item));
  }

  // ── Price Tiers ─────────────────────────────────────────────────────────────
  function addPriceTier(tierType: "PACK" | "VOLUME") {
    setPriceTiers((t) => [...t, { tierType, minQty: 1, price: 0 }]);
  }
  function removePriceTier(idx: number) { setPriceTiers((t) => t.filter((_, i) => i !== idx)); }
  function updatePriceTier(idx: number, patch: Partial<PriceTier>) {
    setPriceTiers((t) => t.map((item, i) => i === idx ? { ...item, ...patch } : item));
  }

  // ── Add units ───────────────────────────────────────────────────────────────
  async function handleAddUnits(e: React.FormEvent) {
    e.preventDefault();
    setAddingUnits(true);
    setNewCodes([]);
    try {
      const res = await fetch(`/api/products/${id}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: parseInt(unitsQty) || 1 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al crear unidades");
      setNewCodes(json.codes ?? []);
      setUnitsQty("1");
      fetchProduct();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setAddingUnits(false);
    }
  }

  // ── Assign unit ─────────────────────────────────────────────────────────────
  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignUnit) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/products/${id}/units/${assignUnit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: assignUserId || null, notes: assignNotes }),
      });
      if (!res.ok) throw new Error("Error al asignar");
      setAssignUnit(null);
      setAssignUserId("");
      setAssignNotes("");
      fetchProduct();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setAssigning(false);
    }
  }

  const isPPF = form.category === "AUTOMOTIVE" && form.subcategory === "PPF";

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
    </div>
  );

  if (error && !product) return (
    <div className="space-y-4">
      <Button variant="outline" onClick={() => router.back()} className="gap-2">
        <ArrowLeft size={16} /> Volver
      </Button>
      <div className="rounded-md bg-red-50 p-4 text-red-600">{error}</div>
    </div>
  );

  return (
    <div className="space-y-6 pb-10">

      {/* ── Hero ── */}
      <div className="relative rounded-xl overflow-hidden">
        {/* Background image */}
        {product?.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.imageUrl}
              alt={product.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/90" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-zinc-950" />
        )}

        {/* Hero content */}
        <div className="relative z-10 px-6 py-10 md:px-10 md:py-14">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft size={16} /> Volver a productos
          </button>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white">{product?.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Badge className={`text-xs border-0 ${CATEGORY_COLORS[product?.category ?? ""] ?? ""}`}>
                  {CATEGORY_LABEL[product?.category ?? ""] ?? product?.category}
                </Badge>
                {product?.subcategory && (
                  <Badge variant="secondary" className="text-xs">{product.subcategory}</Badge>
                )}
                {product?.brand && (
                  <Badge variant="outline" className="text-xs text-white/80 border-white/30">{product.brand}</Badge>
                )}
                {product?.shade && (
                  <Badge variant="outline" className="text-xs text-white/80 border-white/30">Tonalidad: {product.shade}%</Badge>
                )}
                {product && product.stock <= product.minStock && (
                  <Badge variant="destructive" className="text-xs">Stock Bajo</Badge>
                )}
              </div>
              {product?.description && (
                <p className="text-white/70 text-sm mt-4 max-w-2xl line-clamp-2">{product.description}</p>
              )}
            </div>
            <Button onClick={openEditModal} className="gap-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white border border-white/20 shrink-0">
              <Pencil size={15} />
              Editar producto
            </Button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {/* ── Info cards ── */}
      {product && (
        <TooltipProvider>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Card
                  className="relative overflow-hidden border border-zinc-800 cursor-default"
                  style={{ background: "radial-gradient(circle at top right, #27272a 0%, #000000 65%)" }}
                >
                  <CardContent className="flex flex-col items-center justify-center text-center py-6">
                    <div className="flex items-center gap-1.5 text-zinc-400 mb-2">
                      <DollarSign size={14} />
                      <span className="text-xs">Precio de venta</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{formatCurrency(product.price)}</p>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>Precio de venta final</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Card
                  className="relative overflow-hidden border border-zinc-800 cursor-default"
                  style={{ background: "radial-gradient(circle at top right, #27272a 0%, #000000 65%)" }}
                >
                  <CardContent className="flex flex-col items-center justify-center text-center py-6">
                    <div className="flex items-center gap-1.5 text-zinc-400 mb-2">
                      <Layers size={14} />
                      <span className="text-xs">Stock</span>
                    </div>
                    <p className={`text-2xl font-bold ${product.stock <= product.minStock ? "text-red-400" : "text-white"}`}>
                      {product.stock}
                      <span className="text-sm font-normal text-zinc-500 ml-1">/ {product.minStock} m&#237;n.</span>
                    </p>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>Stock disponible</TooltipContent>
            </Tooltip>

            {isAdmin && product.cost != null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Card
                    className="relative overflow-hidden border border-zinc-800 cursor-default"
                    style={{ background: "radial-gradient(circle at top right, #27272a 0%, #000000 65%)" }}
                  >
                    <CardContent className="flex flex-col items-center justify-center text-center py-6">
                      <div className="flex items-center gap-1.5 text-zinc-400 mb-2">
                        <Tag size={14} />
                        <span className="text-xs">Costo landed</span>
                      </div>
                      <p className="text-2xl font-bold text-white">{formatCurrency(product.cost)}</p>
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>Precio de costo del rollo en Argentina</TooltipContent>
              </Tooltip>
            )}

            {isAdmin && product.cost != null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Card
                    className="relative overflow-hidden border border-zinc-800 cursor-default"
                    style={{ background: "radial-gradient(circle at top right, #27272a 0%, #000000 65%)" }}
                  >
                    <CardContent className="flex flex-col items-center justify-center text-center py-6">
                      <div className="flex items-center gap-1.5 text-zinc-400 mb-2">
                        <BarChart3 size={14} />
                        <span className="text-xs">Margen</span>
                      </div>
                      <p className="text-2xl font-bold text-green-400">
                        {(((product.price - product.cost) / product.price) * 100).toFixed(1)}%
                        <span className="text-sm font-normal text-zinc-500 ml-1">
                          ({formatCurrency(product.price - product.cost)})
                        </span>
                      </p>
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>Margen de ganancia</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      )}

      {/* ── Discounts display ── */}
      {product && product.discounts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Tag size={18} className="text-amber-500" /> Descuentos</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {product.discounts.map((d, i) => {
                const discountedPrice = d.type === "PERCENTAGE"
                  ? product.price * (1 - d.value / 100)
                  : product.price - d.value;
                return (
                  <div key={i} className="rounded-lg border p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{d.label || `Descuento ${i + 1}`}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        -{d.type === "PERCENTAGE" ? `${d.value}%` : formatCurrency(d.value)}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-amber-600">{formatCurrency(discountedPrice)}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Price Tiers display ── */}
      {product && (product as ProductDetail & { priceTiers?: PriceTier[] }).priceTiers && (product as ProductDetail & { priceTiers?: PriceTier[] }).priceTiers!.length > 0 && (() => {
        const tiers = (product as ProductDetail & { priceTiers?: PriceTier[] }).priceTiers!;
        const packTiers = tiers.filter((t) => t.tierType === "PACK");
        const volumeTiers = tiers.filter((t) => t.tierType === "VOLUME");
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {packTiers.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Package size={18} className="text-blue-500" /> Precios por Pack</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {packTiers.map((t, i) => (
                      <div key={i} className="rounded-lg border p-3 flex items-center justify-between">
                        <span className="text-sm font-medium">{t.minQty} {t.minQty === 1 ? "rollo" : "rollos"}</span>
                        <span className="text-lg font-bold text-blue-600">{formatCurrency(Number(t.price))}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {volumeTiers.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Layers size={18} className="text-green-500" /> Precios por Volumen</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {volumeTiers.map((t, i) => (
                      <div key={i} className="rounded-lg border p-3 flex items-center justify-between">
                        <span className="text-sm font-medium">{t.minQty}+ unidades</span>
                        <span className="text-lg font-bold text-green-600">{formatCurrency(Number(t.price))}/u</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })()}

      {/* ── Description ── */}
      {product?.description && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Info size={18} className="text-primary" /> Descripción</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{product.description}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Units section ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <QrCode size={18} className="text-primary" />
                Unidades con código de trazabilidad
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Cada unidad tiene un código único: <code className="bg-muted px-1 rounded text-xs">[SUBCATEGORÍA]-[TONALIDAD]-[SECUENCIA]</code>
              </p>
            </div>
            <Button onClick={() => { setAddUnitsOpen(true); setNewCodes([]); }} className="gap-2">
              <Plus size={16} /> Agregar unidades
            </Button>
          </div>
        </CardHeader>
        <CardContent>

          {/* Add units dialog */}
          <Dialog open={addUnitsOpen} onOpenChange={setAddUnitsOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Generar unidades</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddUnits} className="space-y-4">
                <div className="space-y-1">
                  <Label>Cantidad de unidades *</Label>
                  <Input type="number" min="1" max="500" value={unitsQty}
                    onChange={(e) => setUnitsQty(e.target.value)} required />
                  <p className="text-xs text-muted-foreground">Se generará un código único por cada unidad.</p>
                </div>
                {newCodes.length > 0 && (
                  <div className="rounded-md border p-3 space-y-1 max-h-40 overflow-y-auto">
                    <p className="text-xs font-medium text-green-700 mb-2">{"✓"} {newCodes.length} unidades creadas:</p>
                    {newCodes.map((code) => (
                      <code key={code} className="block text-xs bg-muted px-2 py-0.5 rounded font-mono">{code}</code>
                    ))}
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => setAddUnitsOpen(false)}>Cerrar</Button>
                  <Button type="submit" disabled={addingUnits}>
                    {addingUnits ? "Generando..." : "Generar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Assign unit dialog */}
          <Dialog open={!!assignUnit} onOpenChange={(open) => { if (!open) setAssignUnit(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Send size={16} className="text-primary" />
                  Enviar unidad
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAssign} className="space-y-3">
                <div className="rounded-md bg-muted/40 border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Código</p>
                  <code className="text-sm font-mono font-bold">{assignUnit?.code}</code>
                </div>
                <div className="space-y-1">
                  <Label>Asignar a usuario</Label>
                  <UserSearchSelect
                    users={users}
                    value={assignUserId}
                    onValueChange={setAssignUserId}
                    placeholder="Seleccionar usuario..."
                    showUnassign
                  />
                </div>
                <div className="space-y-1">
                  <Label>Notas de envío</Label>
                  <Textarea value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} rows={2} placeholder="Opcional..." />
                </div>
                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => setAssignUnit(null)}>Cancelar</Button>
                  <Button type="submit" disabled={assigning} className="gap-2">
                    <Send size={14} />
                    {assigning ? "Enviando..." : "Enviar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Units table */}
          {!product?.units?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Sin unidades generadas aún. Hacé clic en &quot;Agregar unidades&quot; para comenzar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Asignado a</TableHead>
                    <TableHead>Fecha asignación</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead>Fecha creación</TableHead>
                    <TableHead>Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {product.units.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell>
                        <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded font-bold tracking-wide">
                          {unit.code}
                        </code>
                      </TableCell>
                      <TableCell>
                        {unit.assignedTo ? (
                          <div>
                            <p className="text-sm font-medium">{unit.assignedTo.name}</p>
                            <p className="text-xs text-muted-foreground">{unit.assignedTo.email}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Sin asignar</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {unit.assignedAt ? new Date(unit.assignedAt).toLocaleDateString("es-AR") : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                        {unit.notes ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(unit.createdAt).toLocaleDateString("es-AR")}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            setAssignUnit(unit);
                            setAssignUserId(unit.assignedToId ?? "");
                            setAssignNotes(unit.notes ?? "");
                          }}
                        >
                          <Send size={13} />
                          Enviar a
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Summary */}
          {product && product.units.length > 0 && (
            <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground border-t pt-4">
              <span>Total: <strong className="text-foreground">{product.units.length}</strong> unidades</span>
              <span>Asignadas: <strong className="text-foreground">{product.units.filter((u) => u.assignedToId).length}</strong></span>
              <span>Disponibles: <strong className="text-green-600">{product.units.filter((u) => !u.assignedToId).length}</strong></span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Edit Product Modal ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil size={16} className="text-primary" />
              Editar producto
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">

            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Categoría *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v, subcategory: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTOMOTIVE">Automotriz</SelectItem>
                    <SelectItem value="ARCHITECTURAL">Arquitectónica</SelectItem>
                    <SelectItem value="PPF">PPF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Subcategoría</Label>
                <Select value={form.subcategory || undefined} onValueChange={(v) => setForm({ ...form, subcategory: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {(SUBCATEGORIES[form.category] ?? []).map((sub) => (
                      <SelectItem key={sub.value} value={sub.value}>{sub.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tonalidad</Label>
                {isPPF ? (
                  <Input value={form.shade} onChange={(e) => setForm({ ...form, shade: e.target.value })} placeholder="Ej: Gloss, Matte..." />
                ) : (
                  <Select value={form.shade || undefined} onValueChange={(v) => setForm({ ...form, shade: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {SHADE_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1">
                <Label>Marca</Label>
                <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Stock</Label>
                <Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Stock mínimo</Label>
                <Input type="number" min="0" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Precio de venta *</Label>
                <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </div>
              {isAdmin && (
                <div className="space-y-1">
                  <Label>Costo landed</Label>
                  <Input type="number" step="0.01" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Opcional" />
                </div>
              )}
            </div>

            {/* Imagen */}
            <div className="space-y-1">
              <Label>Foto del producto</Label>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer py-8"
              >
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageFile} className="hidden" />
                {imagePreview ? (
                  <div className="w-24 h-24 rounded-lg border overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <ImagePlus size={36} className="text-muted-foreground/50" />
                )}
                <p className="text-sm text-muted-foreground">Elige o arrastra la foto del producto aquí</p>
                <p className="text-xs text-muted-foreground/60">Ajusta el tamaño automáticamente a 750x750</p>
              </div>
            </div>

            {/* Descripción + IA */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Descripción</Label>
                <Button type="button" variant="outline" size="sm" onClick={improveDescription} disabled={improvingDesc} className="gap-1.5 h-7 text-xs">
                  <Sparkles size={13} className="text-primary" />
                  {improvingDesc ? "Procesando..." : "Mejorar con IA"}
                </Button>
              </div>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Descripción técnica del producto..."
              />
            </div>

            {/* Descuentos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Descuentos</Label>
                <Button type="button" variant="outline" size="sm" onClick={addDiscount} className="gap-1.5 h-7 text-xs">
                  <Plus size={12} /> Agregar
                </Button>
              </div>
              {discounts.length === 0 && <p className="text-xs text-muted-foreground">Sin descuentos.</p>}
              {discounts.map((discount, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Input
                    placeholder="Etiqueta"
                    value={discount.label}
                    onChange={(e) => updateDiscount(idx, { label: e.target.value })}
                    className="h-7 text-xs border-0 px-0 focus-visible:ring-0 bg-transparent flex-1"
                  />
                  <Select value={discount.type} onValueChange={(v) => updateDiscount(idx, { type: v as "FIXED" | "PERCENTAGE" })}>
                    <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">%</SelectItem>
                      <SelectItem value="FIXED">$ Fijo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" step="0.01" min="0" value={discount.value}
                    onChange={(e) => updateDiscount(idx, { value: parseFloat(e.target.value) || 0 })}
                    className="h-7 w-20 text-xs"
                  />
                  <button type="button" onClick={() => removeDiscount(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Precios por Pack / Volumen */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Precios por Pack / Volumen</Label>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => addPriceTier("PACK")} className="gap-1.5 h-7 text-xs">
                    <Plus size={12} /> Pack
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addPriceTier("VOLUME")} className="gap-1.5 h-7 text-xs">
                    <Plus size={12} /> Volumen
                  </Button>
                </div>
              </div>
              {priceTiers.length === 0 && <p className="text-xs text-muted-foreground">Sin precios especiales.</p>}
              {priceTiers.map((tier, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Badge variant="outline" className="text-xs shrink-0">{tier.tierType === "PACK" ? "Pack" : "Volumen"}</Badge>
                  <Input
                    type="number" min="1" value={tier.minQty}
                    onChange={(e) => updatePriceTier(idx, { minQty: parseInt(e.target.value) || 1 })}
                    className="h-7 w-20 text-xs"
                    placeholder="Cant."
                  />
                  <span className="text-xs text-muted-foreground shrink-0">{tier.tierType === "PACK" ? "uds → $" : "uds+ → $/u"}</span>
                  <Input
                    type="number" step="0.01" min="0" value={tier.price}
                    onChange={(e) => updatePriceTier(idx, { price: parseFloat(e.target.value) || 0 })}
                    className="h-7 w-24 text-xs"
                    placeholder="Precio"
                  />
                  <button type="button" onClick={() => removePriceTier(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" type="button" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saveOk ? <><Check size={16} /> Guardado</> : saving ? "Guardando..." : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
