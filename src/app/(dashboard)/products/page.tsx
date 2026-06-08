"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Trash2, Filter, ChevronDown, ChevronRight,
  Search, Package, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown,
  Ban, Power, Settings2,
} from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";

// -- Constants ---------------------------------------------------------------
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

// -- Types -------------------------------------------------------------------
interface Discount {
  id?: string;
  type: "FIXED" | "PERCENTAGE";
  value: number;
  label: string;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
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
  createdAt: string;
  discounts: Discount[];
  _count: { units: number };
}

// -- Button group classes ----------------------------------------------------
const btnBase =
  "h-9 px-3 text-sm font-medium border border-zinc-700 bg-zinc-900 text-zinc-100 " +
  "hover:bg-zinc-800 hover:border-zinc-600 transition-colors flex items-center gap-1.5 " +
  "disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer select-none";
const btnFirst = btnBase + " rounded-l-md border-r-0";
const btnMiddle = btnBase + " border-r-0";
const btnLast = btnBase + " rounded-r-md";

// -- Page --------------------------------------------------------------------
export default function ProductsPage() {
  const { format: formatCurrency } = useCurrency();
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN";
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Filters
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterSubcategory, setFilterSubcategory] = useState<string | null>(null);
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [sortDate, setSortDate] = useState<"asc" | "desc" | null>(null);

  const activeFilterCount = [
    filterCategory !== null,
    filterSubcategory !== null,
    filterLowStock,
    sortDate !== null,
  ].filter(Boolean).length;

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // -- Fetch -----------------------------------------------------------------
  async function fetchProducts() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw new Error("Error al cargar productos");
      setProducts(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchProducts(); }, [search]);

  // -- Client-side filter ----------------------------------------------------
  const visibleProducts = useMemo(() => {
    let result = [...products];
    if (filterCategory) result = result.filter((p) => p.category === filterCategory);
    if (filterSubcategory) result = result.filter((p) => p.subcategory === filterSubcategory);
    if (filterLowStock) result = result.filter((p) => p.stock <= p.minStock);
    if (sortDate === "asc")
      result = [...result].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (sortDate === "desc")
      result = [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return result;
  }, [products, filterCategory, filterSubcategory, filterLowStock, sortDate]);

  function clearFilters() {
    setFilterCategory(null);
    setFilterSubcategory(null);
    setFilterLowStock(false);
    setSortDate(null);
  }

  // -- Selection helpers -----------------------------------------------------
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
      prev.size === visibleProducts.length
        ? new Set()
        : new Set(visibleProducts.map((p) => p.id))
    );
  }, [visibleProducts]);

  // -- Bulk operations -------------------------------------------------------
  async function bulkDeactivate() {
    if (!confirm(`Desactivar ${selected.size} producto(s)?`)) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action: "deactivate" }),
      });
      if (!res.ok) throw new Error();
      setSelected(new Set());
      fetchProducts();
    } catch { setError("Error al desactivar productos"); }
    finally { setBulkLoading(false); }
  }

  async function bulkDelete() {
    if (!confirm(`Eliminar ${selected.size} producto(s) permanentemente? Esta acción no se puede deshacer.`)) return;
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
    } catch { setError("Error al eliminar productos"); }
    finally { setBulkLoading(false); }
  }

  function applySearch() { setSearch(searchInput); }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold">Productos / Stock</h1>
        <Link href="/products/new">
          <Button className="gap-2">
            <Plus size={16} />
            Nuevo Producto
          </Button>
        </Link>
      </div>

      {/* Table Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">

            {/* Search */}
            <div className="relative flex items-center flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar productos..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
                className="pl-9 pr-10 w-full sm:w-56"
              />
              <button
                type="button"
                onClick={applySearch}
                className="absolute right-2 flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <kbd className="text-[10px] font-mono leading-none">↵</kbd>
              </button>
            </div>

            {/* Desktop: Inline Button Group */}
            <div className="hidden sm:flex items-center flex-wrap">

              {/* Filtrar */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={btnFirst}>
                    <Filter size={14} />
                    Filtrar
                    {activeFilterCount > 0 && (
                      <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                        {activeFilterCount}
                      </span>
                    )}
                    <ChevronDown size={12} className="ml-0.5 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">

                  {/* Por fecha */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2">
                      <ArrowUpDown size={13} /> Por fecha
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => setSortDate("desc")} className="gap-2">
                        <ArrowDown size={13} /> Más recientes {sortDate === "desc" && "✓"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSortDate("asc")} className="gap-2">
                        <ArrowUp size={13} /> Más antiguos {sortDate === "asc" && "✓"}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  {/* Por categoría */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2">
                      <Package size={13} /> Por categoría {filterCategory && `(${CATEGORY_LABEL[filterCategory] ?? filterCategory})`}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {Object.entries(CATEGORY_LABEL).map(([val, label]) => (
                        <DropdownMenuItem key={val} onClick={() => { setFilterCategory(filterCategory === val ? null : val); setFilterSubcategory(null); }} className="gap-2">
                          {label} {filterCategory === val && "✓"}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  {/* Por subcategoría */}
                  {filterCategory && (SUBCATEGORIES[filterCategory] ?? []).length > 0 && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2">
                        <Filter size={13} /> Por subcategoría
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {(SUBCATEGORIES[filterCategory] ?? []).map((sub) => (
                          <DropdownMenuItem key={sub.value} onClick={() => setFilterSubcategory(filterSubcategory === sub.value ? null : sub.value)} className="gap-2">
                            {sub.label} {filterSubcategory === sub.value && "✓"}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}

                  {/* Stock bajo */}
                  <DropdownMenuItem onClick={() => setFilterLowStock(!filterLowStock)} className="gap-2">
                    <AlertTriangle size={13} className="text-amber-500" />
                    Stock bajo {filterLowStock && "✓"}
                  </DropdownMenuItem>

                  {activeFilterCount > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={clearFilters} className="text-destructive gap-2">
                        Limpiar filtros
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Stock bajo rapido */}
              <button
                className={btnMiddle + (filterLowStock ? " !bg-zinc-700 !text-amber-400" : "")}
                onClick={() => setFilterLowStock(!filterLowStock)}
              >
                <AlertTriangle size={14} />
                Stock bajo
              </button>

              {/* Desactivados */}
              <Link href="/products/deactivated">
                <button className={btnLast}>
                  <Ban size={14} />
                  Desactivados
                </button>
              </Link>
            </div>

            {/* Mobile: Single Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 h-9 sm:hidden">
                  <Settings2 size={14} />
                  Acciones
                  {activeFilterCount > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  )}
                  <ChevronDown size={12} className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2">
                    <Filter size={13} />
                    Filtrar
                    {activeFilterCount > 0 && <span className="ml-auto text-xs text-muted-foreground">{activeFilterCount}</span>}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2"><ArrowUpDown size={13} />Por fecha</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={() => setSortDate("desc")} className="gap-2">
                          <ArrowDown size={13} /> Más recientes {sortDate === "desc" && "✓"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortDate("asc")} className="gap-2">
                          <ArrowUp size={13} /> Más antiguos {sortDate === "asc" && "✓"}
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2"><Package size={13} />Por categoría</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {Object.entries(CATEGORY_LABEL).map(([val, label]) => (
                          <DropdownMenuItem key={val} onClick={() => { setFilterCategory(filterCategory === val ? null : val); setFilterSubcategory(null); }} className="gap-2">
                            {label} {filterCategory === val && "✓"}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    {filterCategory && (SUBCATEGORIES[filterCategory] ?? []).length > 0 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="gap-2"><Filter size={13} />Por subcategoría</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {(SUBCATEGORIES[filterCategory] ?? []).map((sub) => (
                            <DropdownMenuItem key={sub.value} onClick={() => setFilterSubcategory(filterSubcategory === sub.value ? null : sub.value)} className="gap-2">
                              {sub.label} {filterSubcategory === sub.value && "✓"}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    <DropdownMenuItem onClick={() => setFilterLowStock(!filterLowStock)} className="gap-2">
                      <AlertTriangle size={13} className="text-amber-500" /> Stock bajo {filterLowStock && "✓"}
                    </DropdownMenuItem>
                    {activeFilterCount > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={clearFilters} className="text-destructive gap-2">Limpiar filtros</DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setFilterLowStock(!filterLowStock)} className="gap-2">
                  <AlertTriangle size={13} className={filterLowStock ? "text-amber-400" : "text-amber-500"} />
                  Stock bajo {filterLowStock && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/products/deactivated" className="gap-2">
                    <Ban size={13} /> Desactivados
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Bulk actions - shown when products selected */}
            {selected.size > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-muted-foreground">{selected.size} seleccionado{selected.size > 1 ? "s" : ""}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={bulkDeactivate}
                  disabled={bulkLoading}
                  className="gap-1.5 text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                >
                  <Power size={14} />
                  Desactivar
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
          ) : error ? (
            <div className="rounded-md bg-red-50 p-4 text-red-600">{error}</div>
          ) : (
            <>
            {/* ── Vista móvil ── */}
            <div className="md:hidden space-y-2">
              {visibleProducts.length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">No se encontraron productos</p>
              )}
              {visibleProducts.map((product) => (
                <div key={product.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt={product.name} className="w-10 h-10 rounded-md object-cover border shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-md border bg-muted flex items-center justify-center shrink-0">
                      <Package size={16} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="font-medium text-sm truncate">{product.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className={`text-[10px] px-1.5 py-0 border-0 ${CATEGORY_COLORS[product.category] ?? "bg-zinc-100 text-zinc-700"}`}>
                        {CATEGORY_LABEL[product.category] ?? product.category}
                      </Badge>
                      {product.brand && <span className="text-xs text-muted-foreground">{product.brand}</span>}
                      {product.shade && <span className="text-xs text-muted-foreground">{product.shade}%</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-medium">{formatCurrency(product.price)}</span>
                      <span className={product.stock <= product.minStock ? "font-bold text-red-500" : "text-muted-foreground"}>
                        Stock: {product.stock}/{product.minStock}
                      </span>
                    </div>
                  </div>
                  <Link href={`/products/${product.id}`}>
                    <Button size="icon" className="h-8 w-8 shrink-0 bg-zinc-900 text-white shadow-md hover:bg-zinc-700 active:shadow-none active:translate-y-px transition-all border border-zinc-700" aria-label="Ver producto">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>

            {/* ── Vista desktop ── */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={visibleProducts.length > 0 && selected.size === visibleProducts.length}
                        onCheckedChange={toggleAll}
                        aria-label="Seleccionar todos"
                      />
                    </TableHead>
                    <TableHead>Imagen</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Precio</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleProducts.map((product) => (
                    <TableRow
                      key={product.id}
                      className={`cursor-pointer hover:bg-muted/40 transition-colors ${selected.has(product.id) ? "bg-muted/50" : ""}`}
                      onClick={() => router.push(`/products/${product.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
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
                            className="w-10 h-10 rounded-md object-cover border" />
                        ) : (
                          <div className="w-10 h-10 rounded-md border bg-muted flex items-center justify-center">
                            <Package size={16} className="text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {product.sku ?? <span className="text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell>
                        <span className={product.stock <= product.minStock ? "font-bold text-red-500" : "font-medium"}>
                          {product.stock}
                        </span>
                        <span className="text-muted-foreground text-xs ml-1">/ {product.minStock}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{formatCurrency(product.price)}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs border-0 ${CATEGORY_COLORS[product.category] ?? "bg-zinc-100 text-zinc-700"}`}>
                          {CATEGORY_LABEL[product.category] ?? product.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{product.brand ?? "-"}</TableCell>
                      <TableCell>
                        {product.stock <= product.minStock ? (
                          <Badge variant="destructive" className="whitespace-nowrap">Stock Bajo</Badge>
                        ) : (
                          <Badge variant="default" className="whitespace-nowrap bg-green-600">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibleProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        No se encontraron productos
                      </TableCell>
                    </TableRow>
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