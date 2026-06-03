"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Plus, Trash2, Sparkles, ArrowLeft, ImagePlus, CheckCircle2, PackagePlus,
} from "lucide-react";

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

interface Discount {
  id?: string;
  type: "FIXED" | "PERCENTAGE";
  value: number;
  label: string;
}

const EMPTY_FORM = {
  name: "",
  category: "AUTOMOTIVE",
  subcategory: "",
  brand: "",
  shade: "",
  stock: "0",
  minStock: "0",
  price: "",
  cost: "",
  description: "",
  imageUrl: "",
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NewProductPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [improvingDesc, setImprovingDesc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Image handling (crop & resize to 750×750) ────────────────────────────
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

  // ── AI description ─────────────────────────────────────────────────────────
  async function improveDescription() {
    setImprovingDesc(true);
    try {
      const res = await fetch("/api/ai/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description,
          productName: form.name,
          category: CATEGORY_LABEL[form.category] ?? form.category,
          subcategory: form.subcategory,
          shade: form.shade,
          brand: form.brand,
        }),
      });
      const json = await res.json();
      if (res.ok && json.description) {
        setForm((f) => ({ ...f, description: json.description }));
      }
    } catch { /* silent */ }
    finally { setImprovingDesc(false); }
  }

  // ── Discounts ─────────────────────────────────────────────────────────────
  function addDiscount() {
    setDiscounts((d) => [...d, { type: "PERCENTAGE", value: 0, label: "" }]);
  }

  function removeDiscount(idx: number) {
    setDiscounts((d) => d.filter((_, i) => i !== idx));
  }

  function updateDiscount(idx: number, patch: Partial<Discount>) {
    setDiscounts((d) => d.map((item, i) => i === idx ? { ...item, ...patch } : item));
  }

  // ── Create product ────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/products", {
        method: "POST",
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
        }),
      });
      if (!res.ok) throw new Error("Error al crear producto");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear producto");
    } finally {
      setCreating(false);
    }
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM });
    setDiscounts([]);
    setImagePreview(null);
    setSuccess(false);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const isPPF = form.category === "AUTOMOTIVE" && form.subcategory === "PPF";

  return (
    <div className="space-y-6 max-w-2xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Volver a productos" onClick={() => router.push("/products")}>
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-3xl font-bold">Nuevo Producto</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackagePlus size={20} />
            Datos del producto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">

            {/* Nombre */}
            <div className="space-y-1">
              <Label>Nombre del producto *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Ej: Lámina Premium Negro" />
            </div>

            {/* Categoría + Subcategoría */}
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

            {/* Tonalidad + Marca */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tonalidad {isPPF && <span className="text-muted-foreground text-xs">(manual)</span>}</Label>
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
                <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Ej: 3M, Llumar..." />
              </div>
            </div>

            {/* Stock + Min Stock */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Stock inicial</Label>
                <Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Stock mínimo</Label>
                <Input type="number" min="0" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
              </div>
            </div>

            {/* Precio + Costo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Precio de venta *</Label>
                <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Costo</Label>
                <Input type="number" step="0.01" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Opcional" />
              </div>
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
                {(imagePreview || form.imageUrl) ? (
                  <div className="w-24 h-24 rounded-lg border overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview ?? form.imageUrl ?? ""} alt="preview" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <ImagePlus size={36} className="text-muted-foreground/50" />
                )}
                <p className="text-sm text-muted-foreground">Elige o arrastra la foto del producto aquí</p>
                <p className="text-xs text-muted-foreground/60">Este CRM es tan genial que ajusta el tamaño de la foto automáticamente</p>
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
                  <Plus size={12} /> Agregar descuento
                </Button>
              </div>
              {discounts.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin descuentos configurados.</p>
              )}
              {discounts.map((discount, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <div className="flex-1 space-y-0">
                    <Input
                      placeholder="Etiqueta (ej: Mayorista)"
                      value={discount.label}
                      onChange={(e) => updateDiscount(idx, { label: e.target.value })}
                      className="h-7 text-xs border-0 px-0 focus-visible:ring-0 bg-transparent"
                    />
                  </div>
                  <Select value={discount.type} onValueChange={(v) => updateDiscount(idx, { type: v as "FIXED" | "PERCENTAGE" })}>
                    <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">%</SelectItem>
                      <SelectItem value="FIXED">$ Fijo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" step="0.01" min="0"
                    value={discount.value}
                    onChange={(e) => updateDiscount(idx, { value: parseFloat(e.target.value) || 0 })}
                    className="h-7 w-20 text-xs"
                  />
                  <button type="button" onClick={() => removeDiscount(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Submit button + success message */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3">
                <Button variant="outline" type="button" onClick={() => router.push("/products")}>Cancelar</Button>
                <Button
                  type="submit"
                  disabled={creating || success}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {creating ? "Creando..." : "Crear Producto"}
                </Button>
              </div>

              {success && (
                <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <CheckCircle2 size={20} />
                    <span className="font-medium">¡Producto creado exitosamente!</span>
                  </div>
                  <p className="text-sm text-green-600 dark:text-green-500">¿Qué deseas hacer ahora?</p>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      onClick={resetForm}
                      className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
                    >
                      <Plus size={16} />
                      Crear otro producto
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push("/products")}
                    >
                      Volver a productos
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
