"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";
import { CallDialog } from "@/components/call-dialog";
import { DateTimePicker } from "@/components/ui/date-picker";
import { UserSearchSelect } from "@/components/user-search-select";
import { SearchableSelect } from "@/components/searchable-select";
import { AR_PROVINCES, AR_CITIES } from "@/lib/argentina-geo";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { Pencil, FileText, CalendarDays, Phone, ShoppingCart, CreditCard, ChevronLeft, MapPin, Plus, X, Save, MoreHorizontal, Check, ShieldCheck, Copy } from "lucide-react";

const GoogleLocationMap = dynamic(() => import("@/components/google-location-map"), {
  ssr: false,
  loading: () => <div className="h-[300px] rounded-md bg-muted animate-pulse" />,
});

interface ClientDetail {
  id: string;
  leadNumber: number;
  firstName: string;
  lastName: string;
  name: string;
  company: string | null;
  sector: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  cuit: string | null;
  rut: string | null;
  website: string | null;
  notes: string;
  suppliers: string[];
  priceRange: string;
  purchases: Array<{
    id: string;
    saleNumber: string;
    total: number;
    paymentStatus: string;
    createdAt: string;
    items: Array<{
      productName: string;
      quantity: number;
      unitPrice: number;
    }>;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    date: string;
    saleNumber: string;
  }>;
  balance: number;
}

export default function ClientDetailPage() {
  const { format: formatCurrency } = useCurrency();
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [visitDialogOpen, setVisitDialogOpen] = useState(false);
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [visitSaving, setVisitSaving] = useState(false);
  const [visitForm, setVisitForm] = useState({ assignedToId: "", scheduledDate: "", notes: "" });

  // Editable fields
  const [editNotes, setEditNotes] = useState("");
  const [editSuppliers, setEditSuppliers] = useState<string[]>([]);
  const [editPriceRange, setEditPriceRange] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [savingExtra, setSavingExtra] = useState(false);
  const [extraResult, setExtraResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Warranty
  const [warrantyRolls, setWarrantyRolls] = useState<any[]>([])
  const [selectedRoll, setSelectedRoll] = useState<any | null>(null)
  const [selectedInstallation, setSelectedInstallation] = useState<any | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", company: "", sector: "", email: "",
    phone: "", whatsapp: "", address: "", city: "", state: "", cuit: "", website: "", notes: "",
  });

  function populateForm(c: ClientDetail) {
    setForm({
      firstName: c.firstName || "",
      lastName: c.lastName || "",
      company: c.company || "",
      sector: c.sector || "",
      email: c.email || "",
      phone: c.phone || "",
      whatsapp: c.whatsapp || "",
      address: c.address || "",
      city: c.city || "",
      state: c.state || "",
      cuit: c.cuit || "",
      website: c.website || "",
      notes: c.notes || "",
    });
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setEditMode(false);
      // Refresh
      const r2 = await fetch(`/api/clients/${clientId}`);
      if (r2.ok) {
        const data = await r2.json();
        setClient(data);
        setEditNotes(data.notes || "");
        setEditSuppliers(data.suppliers || []);
        setEditPriceRange(data.priceRange || "");
      }
    } catch {
      alert("Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    async function fetchClient() {
      try {
        const res = await fetch(`/api/clients/${clientId}`);
        if (!res.ok) {
          const errorBody = await res.json().catch(() => null) as { error?: string } | null;
          throw new Error(errorBody?.error || "Error al cargar cliente");
        }
        const json = await res.json();
        setClient(json);
        setEditNotes(json.notes || "");
        setEditSuppliers(json.suppliers || []);
        setEditPriceRange(json.priceRange || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    }
    fetchClient();
    fetch("/api/users").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`/api/clients/${clientId}/warranty-rolls`).then((r) => r.ok ? r.json() : { rolls: [] }).then(({ rolls }) => setWarrantyRolls(Array.isArray(rolls) ? rolls : [])).catch(() => {});
  }, [clientId]);

  function addSupplier() {
    const trimmed = newSupplier.trim();
    if (!trimmed) return;
    setEditSuppliers([...editSuppliers, trimmed]);
    setNewSupplier("");
  }

  function removeSupplier(idx: number) {
    setEditSuppliers(editSuppliers.filter((_, i) => i !== idx));
  }

  async function handleSaveExtra() {
    setSavingExtra(true);
    setExtraResult(null);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: editNotes,
          suppliers: editSuppliers,
          priceRange: editPriceRange,
        }),
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(errorBody?.error || "Error al guardar");
      }
      setExtraResult({ ok: true, msg: "Guardado correctamente" });
    } catch (err) {
      setExtraResult({ ok: false, msg: err instanceof Error ? err.message : "Error" });
    } finally {
      setSavingExtra(false);
    }
  }

  async function handleCreateVisit(e: React.FormEvent) {
    e.preventDefault();
    setVisitSaving(true);
    try {
      await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: clientId, ...visitForm }),
      });
      setVisitDialogOpen(false);
      setVisitForm({ assignedToId: "", scheduledDate: "", notes: "" });
    } catch (err) { console.error(err); }
    finally { setVisitSaving(false); }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Cargando cliente...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-red-600">{error}</div>
    );
  }

  if (!client) return null;

  const paymentStatusLabel: Record<string, string> = {
    PAID: "Pagado",
    PARTIAL: "Parcial",
    PENDING: "Pendiente",
  };

  const paymentStatusVariant: Record<string, "default" | "secondary" | "destructive"> = {
    PAID: "default",
    PARTIAL: "secondary",
    PENDING: "destructive",
  };

  const paymentMethodLabel: Record<string, string> = {
    CASH: "Efectivo",
    TRANSFER: "Transferencia",
    CHECK: "Cheque",
    CREDIT_CARD: "Tarjeta de Crédito",
    OTHER: "Otro",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="p-0 h-auto text-muted-foreground hover:text-foreground mb-1" onClick={() => router.push("/clients")}>
            <ChevronLeft className="h-4 w-4" />Clientes
          </Button>
          <h1 className="text-3xl font-bold">{client.company || client.name}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded mr-2">C-{String(client.leadNumber).padStart(4, "0")}</span>
            {client.name}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {editMode ? (
            <>
              <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                <Check className="h-4 w-4 mr-1" />{saving ? "Guardando..." : "Guardar"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>Cancelar</Button>
            </>
          ) : (
            <>
              {/* Desktop buttons */}
              <div className="hidden sm:flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => { if (client) { populateForm(client); setEditMode(true); } }}>
                  <Pencil className="h-4 w-4 mr-1" />Editar
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/quotes?contactId=${clientId}`}>
                    <FileText className="h-4 w-4 mr-1" />Presupuesto
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/sales?contactId=${clientId}`}>
                    <ShoppingCart className="h-4 w-4 mr-1" />Crear Venta
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setVisitDialogOpen(true)}>
                  <CalendarDays className="h-4 w-4 mr-1" />Visita
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCallDialogOpen(true)}>
                  <Phone className="h-4 w-4 mr-1" />Llamada
                </Button>
                <Button variant="outline" size="sm" onClick={() => document.getElementById("payments-section")?.scrollIntoView({ behavior: "smooth" })}>
                  <CreditCard className="h-4 w-4 mr-1" />Pagos
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                  asChild={client.balance > 0}
                  disabled={client.balance <= 0}
                >
                  {client.balance > 0 ? (
                    <Link href={`/payments?contactId=${clientId}`}>
                      <CreditCard className="h-4 w-4 mr-1" />Registrar Pago
                    </Link>
                  ) : (
                    <span><CreditCard className="h-4 w-4 mr-1" />Registrar Pago</span>
                  )}
                </Button>
              </div>
              {/* Mobile dropdown */}
              <div className="flex sm:hidden gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreHorizontal className="h-4 w-4 mr-1" />Acciones
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { if (client) { populateForm(client); setEditMode(true); } }}>
                      <Pencil className="h-4 w-4 mr-2" />Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/quotes?contactId=${clientId}`}>
                        <FileText className="h-4 w-4 mr-2" />Presupuesto
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/sales?contactId=${clientId}`}>
                        <ShoppingCart className="h-4 w-4 mr-2" />Crear Venta
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setVisitDialogOpen(true)}>
                      <CalendarDays className="h-4 w-4 mr-2" />Visita
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCallDialogOpen(true)}>
                      <Phone className="h-4 w-4 mr-2" />Llamada
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => document.getElementById("payments-section")?.scrollIntoView({ behavior: "smooth" })}>
                      <CreditCard className="h-4 w-4 mr-2" />Pagos
                    </DropdownMenuItem>
                    {client.balance > 0 && (
                      <DropdownMenuItem asChild>
                        <Link href={`/payments?contactId=${clientId}`} className="text-green-600">
                          <CreditCard className="h-4 w-4 mr-2" />Registrar Pago
                        </Link>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Contact Info */}
        {editMode ? (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Editar Datos de Contacto</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Apellido</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Empresa</Label>
                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Sector</Label>
                <Input value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>WhatsApp</Label>
                <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>CUIT</Label>
                <Input value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Dirección</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Provincia</Label>
                <SearchableSelect
                  options={AR_PROVINCES}
                  value={form.state}
                  onValueChange={(v) => setForm({ ...form, state: v, city: "" })}
                  placeholder="Seleccionar provincia..."
                />
              </div>
              <div className="space-y-1">
                <Label>Ciudad</Label>
                <SearchableSelect
                  options={AR_CITIES[form.state] || []}
                  value={form.city}
                  onValueChange={(v) => setForm({ ...form, city: v })}
                  placeholder="Seleccionar ciudad..."
                />
              </div>
              <div className="space-y-1">
                <Label>Sitio Web</Label>
                <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Notas</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
              </div>
            </CardContent>
          </Card>
        ) : (
        <Card>
          <CardHeader>
            <CardTitle>Informacion de Contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Email:</span>{" "}
              {client.email || "-"}
            </p>
            <p>
              <span className="font-medium">Telefono:</span>{" "}
              {client.phone || "-"}
            </p>
            <p>
              <span className="font-medium">Dirección:</span>{" "}
              {client.address || "-"}
            </p>
            <p>
              <span className="font-medium">Ciudad:</span>{" "}
              {client.city || "-"}
            </p>
            <p>
              <span className="font-medium">Provincia:</span>{" "}
              {client.state || "-"}
            </p>
            <p>
              <span className="font-medium">CUIT:</span> {client.cuit || "-"}
            </p>
            <p>
              <span className="font-medium">Sitio Web:</span>{" "}
              {client.website ? (
                <a href={client.website.startsWith("http") ? client.website : `https://${client.website}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{client.website}</a>
              ) : "-"}
            </p>
          </CardContent>
        </Card>
        )}

        {/* Outstanding Balance */}
        <Card>
          <CardHeader>
            <CardTitle>Saldo Pendiente</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-bold ${
                client.balance > 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              {formatCurrency(client.balance)}
            </p>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Total Compras:</span>{" "}
              {client.purchases.length}
            </p>
            <p>
              <span className="font-medium">Total Pagos:</span>{" "}
              {client.payments.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Notes, Suppliers, Price Range */}
      <Card>
        <CardHeader>
          <CardTitle>Notas, Proveedores y Rango de Precios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="font-medium">Notas</Label>
            <Textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Notas sobre el cliente..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="font-medium">Proveedores</Label>
            <div className="flex flex-wrap gap-2">
              {editSuppliers.map((s, idx) => (
                <Badge key={idx} variant="secondary" className="gap-1 text-sm py-1 px-2">
                  {s}
                  <button type="button" onClick={() => removeSupplier(idx)} className="ml-1 hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newSupplier}
                onChange={(e) => setNewSupplier(e.target.value)}
                placeholder="Nombre del proveedor"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSupplier(); } }}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addSupplier}>
                <Plus className="h-4 w-4 mr-1" />Agregar
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-medium">Rango de Precios (proveedores actuales)</Label>
            <Textarea
              value={editPriceRange}
              onChange={(e) => setEditPriceRange(e.target.value)}
              placeholder="Ej: Proveedor A: $1000-$2000, Proveedor B: $800-$1500..."
              rows={2}
            />
          </div>

          {extraResult && (
            <div className={`rounded-md p-3 text-sm ${extraResult.ok ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"}`}>
              {extraResult.msg}
            </div>
          )}

          <Button onClick={handleSaveExtra} disabled={savingExtra} size="sm">
            <Save className="h-4 w-4 mr-1" />{savingExtra ? "Guardando..." : "Guardar cambios"}
          </Button>
        </CardContent>
      </Card>

      {/* Purchase History */}
      <Card>
        <CardHeader>
          <CardTitle>Historial de Compras</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N.ro Venta</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado Pago</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {client.purchases.map((purchase) => (
                <TableRow key={purchase.id}>
                  <TableCell className="font-medium">
                    {purchase.saleNumber}
                  </TableCell>
                  <TableCell>
                    {purchase.items
                      .map(
                        (item) =>
                          `${item.productName} x${item.quantity}`
                      )
                      .join(", ")}
                  </TableCell>
                  <TableCell>{formatCurrency(purchase.total)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        paymentStatusVariant[purchase.paymentStatus] || "outline"
                      }
                    >
                      {paymentStatusLabel[purchase.paymentStatus] ||
                        purchase.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(purchase.createdAt)}</TableCell>
                </TableRow>
              ))}
              {client.purchases.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    No hay compras registradas
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Warranty Rolls */}
      {warrantyRolls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              Garantías digitales
            </CardTitle>
            <CardDescription>
              Rollos adquiridos y activaciones registradas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Código de rollo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Activaciones</TableHead>
                  <TableHead>Fecha de venta</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warrantyRolls.map((roll) => {
                  const activeCount = roll._count.installations
                  const totalCount = roll.installations.length
                  return (
                    <TableRow key={roll.id}>
                      <TableCell className="font-medium">{roll.product.name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {roll.fullRollCode}
                        </code>
                      </TableCell>
                      <TableCell>
                        <RollStatusBadge status={roll.status} />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          <span className="font-semibold text-green-600">{activeCount}</span>
                          <span className="text-muted-foreground"> / {totalCount}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(roll.saleItem.sale.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedRoll(roll)}
                        >
                          Ver instalaciones
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Payment History */}
      <Card id="payments-section">
        <CardHeader>
          <CardTitle>Historial de Pagos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Venta</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Metodo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {client.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{formatDate(payment.date)}</TableCell>
                  <TableCell>{payment.saleNumber}</TableCell>
                  <TableCell>{formatCurrency(payment.amount)}</TableCell>
                  <TableCell>
                    {paymentMethodLabel[payment.method] || payment.method}
                  </TableCell>
                </TableRow>
              ))}
              {client.payments.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground"
                  >
                    No hay pagos registrados
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Map */}
      {(client.address || client.city) && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Ubicación</CardTitle></CardHeader>
          <CardContent>
            <GoogleLocationMap address={[client.address, client.city, client.state].filter(Boolean).join(", ")} />
          </CardContent>
        </Card>
      )}

      {/* Warranty — installations modal */}
      <Dialog open={!!selectedRoll} onOpenChange={() => setSelectedRoll(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                {selectedRoll?.fullRollCode}
              </code>
              — Instalaciones
            </DialogTitle>
            <DialogDescription>
              {selectedRoll?.product.name} ·{" "}
              {selectedRoll?._count.installations} activas de{" "}
              {selectedRoll?.installations.length} posibles
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 mt-2">
            {selectedRoll?.installations.map((inst: any) => (
              <div
                key={inst.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-6 text-right">
                    {inst.installationNumber}
                  </span>
                  <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                    {inst.installationCode}
                  </code>
                  <InstallationStatusBadge status={inst.status} />
                </div>

                <div className="flex items-center gap-2">
                  {inst.status === "ACTIVE" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedInstallation(inst)}
                    >
                      Ver cliente
                    </Button>
                  )}
                  {inst.status === "PENDING" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const url = `${window.location.origin}/garantia/${inst.activationToken}`
                        navigator.clipboard.writeText(url).catch(() => {})
                        setCopiedToken(inst.id)
                        setTimeout(() => setCopiedToken(null), 2000)
                      }}
                    >
                      {copiedToken === inst.id ? (
                        <Check className="h-4 w-4 mr-1 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4 mr-1" />
                      )}
                      {copiedToken === inst.id ? "Copiado" : "Copiar link"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Warranty — client detail modal */}
      <Dialog
        open={!!selectedInstallation}
        onOpenChange={() => setSelectedInstallation(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Datos del cliente final</DialogTitle>
            <DialogDescription>
              <code className="text-xs font-mono">
                {selectedInstallation?.installationCode}
              </code>
            </DialogDescription>
          </DialogHeader>

          {selectedInstallation && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Nombre</p>
                  <p className="font-medium">{selectedInstallation.clientName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Email</p>
                  <p className="font-medium">{selectedInstallation.clientEmail}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Teléfono</p>
                  <p className="font-medium">{selectedInstallation.clientPhone ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">DNI</p>
                  <p className="font-medium">{selectedInstallation.clientDni ?? "—"}</p>
                </div>
              </div>

              <div className="border-t pt-3 space-y-2 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Tipo de bien</p>
                  <p className="font-medium">
                    {selectedInstallation.assetType === "VEHICLE"
                      ? "Vehículo"
                      : "Inmueble / superficie"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Descripción</p>
                  <p className="font-medium">{selectedInstallation.assetDescription}</p>
                </div>
                {selectedInstallation.installerName && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Instalador</p>
                    <p className="font-medium">{selectedInstallation.installerName}</p>
                  </div>
                )}
              </div>

              <div className="border-t pt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Activada</p>
                  <p className="font-medium">
                    {formatDate(selectedInstallation.activatedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Vence</p>
                  <p className="font-medium">
                    {formatDate(selectedInstallation.expiresAt)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Visit Dialog */}
      <Dialog open={visitDialogOpen} onOpenChange={setVisitDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agendar Visita</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateVisit} className="space-y-4">
            <div className="space-y-2">
              <Label>Asignar a</Label>
              <UserSearchSelect
                users={users}
                value={visitForm.assignedToId || ""}
                onValueChange={(v) => setVisitForm({ ...visitForm, assignedToId: v })}
                placeholder="Seleccionar..."
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha y hora *</Label>
              <DateTimePicker
                value={visitForm.scheduledDate}
                onChange={(v) => setVisitForm({ ...visitForm, scheduledDate: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={visitForm.notes} onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setVisitDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={visitSaving}>{visitSaving ? "Agendando..." : "Agendar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CallDialog open={callDialogOpen} onOpenChange={setCallDialogOpen} contactId={clientId} />
    </div>
  );
}

function RollStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    IN_STOCK:  { label: "En stock",   className: "bg-gray-100 text-gray-700" },
    SOLD:      { label: "Vendido",    className: "bg-blue-100 text-blue-700" },
    IN_USE:    { label: "En uso",     className: "bg-green-100 text-green-700" },
    EXHAUSTED: { label: "Agotado",    className: "bg-orange-100 text-orange-700" },
    VOIDED:    { label: "Anulado",    className: "bg-red-100 text-red-700" },
  }
  const { label, className } = map[status] ?? { label: status, className: "" }
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${className}`}>
      {label}
    </span>
  )
}

function InstallationStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    PENDING:  { label: "Pendiente", className: "bg-gray-100 text-gray-600" },
    ACTIVE:   { label: "Activa",    className: "bg-green-100 text-green-700" },
    EXPIRED:  { label: "Vencida",   className: "bg-orange-100 text-orange-700" },
    VOIDED:   { label: "Anulada",   className: "bg-red-100 text-red-700" },
  }
  const { label, className } = map[status] ?? { label: status, className: "" }
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${className}`}>
      {label}
    </span>
  )
}
