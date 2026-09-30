"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Search, Store, Tags, ChevronLeft, ChevronRight } from "lucide-react";
import { AR_PROVINCES, UY_DEPARTMENTS } from "@/lib/argentina-geo";
import { useCurrency } from "@/contexts/currency-context";

interface DiscountTag {
  id: string; code: string; name: string; type: string; value: string; active: boolean;
}

interface Reseller {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  state: string | null;
  cuit: string | null;
  createdAt: string;
  discountTag: DiscountTag | null;
  _count: { productDiscounts: number; sales: number };
}

const FORM_VACIO = {
  firstName: "", lastName: "", company: "", email: "", phone: "",
  whatsapp: "", cuit: "", address: "", city: "", state: "",
};

/**
 * Revendedores.
 *
 * Un revendedor le compra a Kristall para revenderle a talleres. Es lo mismo que
 * un Cliente en todo lo comercial —ventas, cuenta corriente, portal, descuentos
 * pactados— y por eso **la ficha es la misma pantalla**: `/revendedores/[id]`
 * reusa `/clients/[id]`, no la copia.
 *
 * Lo único que esta sección hace distinto es **listarlos aparte y no contarlos
 * como clientes propios**: sus talleres son su cartera, no la de Kristall.
 */
export default function ResellersPage() {
  const { format: formatCurrency } = useCurrency();
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchResellers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ page: String(page) });
      if (debounced) qs.set("search", debounced);
      const res = await fetch(`/api/resellers?${qs}`);
      if (!res.ok) throw new Error("No se pudieron cargar los revendedores");
      const data = await res.json();
      setResellers(data.resellers ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los revendedores");
      setResellers([]);
    } finally {
      setLoading(false);
    }
  }, [page, debounced]);

  useEffect(() => { fetchResellers(); }, [fetchResellers]);

  async function crear() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError("Nombre y apellido son obligatorios");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch("/api/resellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.fromEntries(
            Object.entries(form).map(([k, v]) => [k, v.trim() === "" ? null : v.trim()])
          )
        ),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo crear");
      setOpen(false);
      setForm(FORM_VACIO);
      setPage(1);
      await fetchResellers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setSaving(false);
    }
  }

  const nombreDe = (r: Reseller) =>
    r.company || `${r.firstName} ${r.lastName}`.trim();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Store className="h-6 w-6" />
            Revendedores
          </h1>
          <p className="text-sm text-muted-foreground">
            Compran para revender a talleres. Se les vende con descuentos pactados por producto.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Nuevo revendedor
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">
            {total} {total === 1 ? "revendedor" : "revendedores"}
          </CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar por nombre, empresa, mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : resellers.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {debounced
                ? "Ningún revendedor coincide con la búsqueda."
                : "Todavía no hay revendedores. El primero se crea con el botón de arriba."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Revendedor</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Descuentos</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resellers.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {/* La ficha es la de clientes: /revendedores/[id] reusa esa
                          misma pantalla, no una copia. */}
                      <Link href={`/revendedores/${r.id}`} className="font-medium hover:underline">
                        {nombreDe(r)}
                      </Link>
                      {r.company && (
                        <p className="text-xs text-muted-foreground">
                          {r.firstName} {r.lastName}
                        </p>
                      )}
                      {r.cuit && <p className="text-xs text-muted-foreground">CUIT {r.cuit}</p>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.email && <p className="truncate">{r.email}</p>}
                      {(r.phone || r.whatsapp) && (
                        <p className="text-muted-foreground">{r.phone || r.whatsapp}</p>
                      )}
                      {!r.email && !r.phone && !r.whatsapp && (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {[r.city, r.state].filter(Boolean).join(", ") || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {/* Los dos modos son excluyentes: con acuerdos cargados, la
                          etiqueta general NO se aplica (ver resolveLineTag). Que
                          se vea desde el listado evita tener que entrar a cada
                          ficha para saber con qué precio se le vende. */}
                      {r._count.productDiscounts > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Tags className="h-3.5 w-3.5 text-primary" />
                          {r._count.productDiscounts} por producto
                        </span>
                      ) : r.discountTag?.active ? (
                        <Badge variant="outline">
                          {r.discountTag.code} ·{" "}
                          {r.discountTag.type === "FIXED"
                            ? formatCurrency(Number(r.discountTag.value))
                            : `${Number(r.discountTag.value)}%`}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Precio de lista</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">{r._count.sales}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="outline" size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline" size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo revendedor</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rFirst">Nombre *</Label>
              <Input id="rFirst" value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rLast">Apellido *</Label>
              <Input id="rLast" value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="rCompany">Razón social</Label>
              <Input id="rCompany" value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rCuit">CUIT / RUT</Label>
              <Input id="rCuit" value={form.cuit}
                onChange={(e) => setForm({ ...form, cuit: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rEmail">Email</Label>
              <Input id="rEmail" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rPhone">Teléfono</Label>
              <Input id="rPhone" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rWhatsapp">WhatsApp</Label>
              <Input id="rWhatsapp" value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="rAddress">Dirección</Label>
              <Input id="rAddress" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rCity">Ciudad</Label>
              <Input id="rCity" value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rState">Provincia / Depto.</Label>
              <select
                id="rState"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              >
                <option value="">—</option>
                {[...AR_PROVINCES, ...UY_DEPARTMENTS].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <p className="text-xs text-muted-foreground">
            Los descuentos pactados se cargan después, desde la ficha del revendedor.
          </p>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={crear} disabled={saving}>
              {saving ? "Creando..." : "Crear revendedor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
