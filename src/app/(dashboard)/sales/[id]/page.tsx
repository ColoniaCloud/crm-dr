"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDate, formatDateTime } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";
import {
  ChevronLeft, Trash2, AlertTriangle, User, Package,
  CreditCard, FileCheck, Receipt, Pencil, History, ShieldAlert, DollarSign,
} from "lucide-react";

interface SaleItem {
  id: string;
  quantity: number;
  unitPrice: string;
  total: string;
  product: { id: string; name: string; category: string | null; sku: string | null };
}

interface Payment {
  id: string;
  amount: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  paidAt: string;
}

interface Remito {
  id: string;
  number: number;
  issuedAt: string;
  signedAt: string | null;
  notes: string | null;
}

interface SaleDetail {
  id: string;
  number: number;
  contactId: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    cuit: string | null;
    type: string;
  };
  user: { id: string; name: string };
  type: string;
  status: string;
  requiresFactura: boolean;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  notes: string | null;
  createdAt: string;
  items: SaleItem[];
  payments: Payment[];
  remito: Remito | null;
}

interface AuditLog {
  id: string;
  paymentId: string | null;
  userId: string;
  userName: string;
  userEmail: string;
  action: "CREATED" | "EDITED" | "DELETED";
  oldValues: string | null;
  newValues: string | null;
  description: string;
  createdAt: string;
}

const paymentMethodLabel: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CHECK: "Cheque",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

const actionLabel: Record<string, string> = {
  CREATED: "Creado",
  EDITED: "Editado",
  DELETED: "Eliminado",
};

const actionBadgeClass: Record<string, string> = {
  CREATED: "bg-green-100 text-green-800 border-0",
  EDITED: "bg-blue-100 text-blue-800 border-0",
  DELETED: "bg-red-100 text-red-800 border-0",
};

const saleTypeLabel: Record<string, string> = {
  REGULAR: "Regular",
  CONSIGNMENT: "Consignación",
};

export default function SaleDetailPage() {
  const { data: session } = useSession();
  const { format: formatCurrency } = useCurrency();
  const params = useParams();
  const router = useRouter();
  const saleId = params.id as string;
  const isSuperAdmin = session?.user?.role === "SUPERADMIN";

  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Delete sale dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Edit payment dialog
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", method: "", reference: "", notes: "", paidAt: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete payment dialog
  const [deletePayment, setDeletePayment] = useState<Payment | null>(null);
  const [deletingPayment, setDeletingPayment] = useState(false);
  const [deletePaymentError, setDeletePaymentError] = useState("");

  // Edit sale total dialog
  const [editTotalOpen, setEditTotalOpen] = useState(false);
  const [editTotalForm, setEditTotalForm] = useState({ total: "", subtotal: "", discount: "", tax: "", reason: "" });
  const [editTotalSaving, setEditTotalSaving] = useState(false);
  const [editTotalError, setEditTotalError] = useState("");

  // Audit log
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);

  useEffect(() => { fetchSale(); }, [saleId]);

  async function fetchSale() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/${saleId}`);
      if (!res.ok) throw new Error("Venta no encontrada");
      setSale(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar venta");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAuditLogs() {
    if (!isSuperAdmin) return;
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/sales/${saleId}/payment-audit`);
      if (res.ok) setAuditLogs(await res.json());
    } finally {
      setAuditLoading(false);
    }
  }

  function openEditTotal() {
    if (!sale) return;
    setEditTotalForm({
      total: Number(sale.total).toFixed(2),
      subtotal: Number(sale.subtotal).toFixed(2),
      discount: Number(sale.discount).toFixed(2),
      tax: Number(sale.tax).toFixed(2),
      reason: "",
    });
    setEditTotalError("");
    setEditTotalOpen(true);
  }

  async function handleEditTotal() {
    if (!sale) return;
    setEditTotalSaving(true);
    setEditTotalError("");
    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total: parseFloat(editTotalForm.total),
          subtotal: parseFloat(editTotalForm.subtotal),
          discount: parseFloat(editTotalForm.discount),
          tax: parseFloat(editTotalForm.tax),
          reason: editTotalForm.reason || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Error al guardar");
      }
      setEditTotalOpen(false);
      await fetchSale();
      if (auditExpanded) await fetchAuditLogs();
    } catch (err) {
      setEditTotalError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setEditTotalSaving(false);
    }
  }

  function openEditPayment(payment: Payment) {
    setEditPayment(payment);
    setEditForm({
      amount: Number(payment.amount).toString(),
      method: payment.method || "",
      reference: payment.reference || "",
      notes: payment.notes || "",
      paidAt: payment.paidAt ? payment.paidAt.slice(0, 10) : "",
    });
    setEditError("");
  }

  async function handleEditPayment() {
    if (!editPayment) return;
    setEditSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/payments/${editPayment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(editForm.amount),
          method: editForm.method || null,
          reference: editForm.reference || null,
          notes: editForm.notes || null,
          paidAt: editForm.paidAt ? new Date(editForm.paidAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Error al guardar");
      }
      setEditPayment(null);
      await fetchSale();
      if (auditExpanded) await fetchAuditLogs();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeletePayment() {
    if (!deletePayment) return;
    setDeletingPayment(true);
    setDeletePaymentError("");
    try {
      const res = await fetch(`/api/payments/${deletePayment.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Error al eliminar");
      }
      setDeletePayment(null);
      await fetchSale();
      if (auditExpanded) await fetchAuditLogs();
    } catch (err) {
      setDeletePaymentError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeletingPayment(false);
    }
  }

  async function handleDelete() {
    if (!sale) return;
    const expectedName = sale.contact.company || `${sale.contact.firstName} ${sale.contact.lastName}`.trim();
    if (deleteConfirmName.trim().toLowerCase() !== expectedName.toLowerCase()) {
      setError("El nombre no coincide con el cliente de esta venta");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/sales/${saleId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al eliminar venta");
      }
      router.push("/sales");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar venta");
    } finally {
      setDeleting(false);
    }
  }

  async function toggleAuditLogs() {
    if (!auditExpanded) {
      setAuditExpanded(true);
      await fetchAuditLogs();
    } else {
      setAuditExpanded(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!sale) {
    return <div className="rounded-md bg-red-50 p-4 text-red-600">{error || "Venta no encontrada"}</div>;
  }

  const contactName = sale.contact.company || `${sale.contact.firstName} ${sale.contact.lastName}`.trim();
  const totalPaid = sale.payments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const totalNum = parseFloat(sale.total);
  const remaining = totalNum - totalPaid;
  const isPaid = remaining <= 0;

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="p-0 h-auto text-muted-foreground hover:text-foreground mb-1" onClick={() => router.push("/sales")}>
            <ChevronLeft className="h-4 w-4" />Ventas
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold">Venta #{sale.number}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDateTime(sale.createdAt)} · Registrada por {sale.user.name}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Badge className={isPaid ? "bg-green-100 text-green-800 border-0" : "bg-amber-100 text-amber-800 border-0"}>
            {isPaid ? "Pagado" : "Pendiente"}
          </Badge>
          <Badge variant="outline">{saleTypeLabel[sale.type] || sale.type}</Badge>
          {sale.requiresFactura && <Badge variant="outline">Factura</Badge>}
          {isSuperAdmin && (
            <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" />Eliminar
            </Button>
          )}
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Client Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium text-base">
              <Link href={sale.contact.type === "CLIENT" ? `/clients/${sale.contact.id}` : `/leads/${sale.contact.id}`} className="hover:underline">
                {contactName}
              </Link>
            </p>
            {sale.contact.cuit && <p><span className="text-muted-foreground">CUIT:</span> {sale.contact.cuit}</p>}
            {sale.contact.email && <p><span className="text-muted-foreground">Email:</span> {sale.contact.email}</p>}
            {sale.contact.phone && <p><span className="text-muted-foreground">Teléfono:</span> {sale.contact.phone}</p>}
          </CardContent>
        </Card>

        {/* Payment Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Estado de Pago</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">{formatCurrency(totalNum)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pagado</span>
              <span className="font-medium text-green-600">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm">
              <span className="font-medium">Restante</span>
              <span className={`font-bold ${remaining > 0 ? "text-red-600" : "text-green-600"}`}>
                {formatCurrency(Math.max(0, remaining))}
              </span>
            </div>
            {remaining > 0 && (
              <div className="w-full bg-muted rounded-full h-2 mt-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (totalPaid / totalNum) * 100)}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Remito */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileCheck className="h-5 w-5" />Remito</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {sale.remito ? (
              <>
                <p><span className="text-muted-foreground">Nro:</span> {sale.remito.number}</p>
                <p><span className="text-muted-foreground">Emitido:</span> {formatDate(sale.remito.issuedAt)}</p>
                <p>
                  <span className="text-muted-foreground">Firmado:</span>{" "}
                  {sale.remito.signedAt ? formatDate(sale.remito.signedAt) : <span className="text-amber-600">Pendiente</span>}
                </p>
                {sale.remito.notes && <p className="text-muted-foreground mt-2">{sale.remito.notes}</p>}
              </>
            ) : (
              <p className="text-muted-foreground">Sin remito generado</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sale Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Productos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Precio Unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sale.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.product.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{item.product.sku || "-"}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 border-t pt-4 space-y-1 text-sm text-right">
            <div className="flex justify-end gap-8">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(sale.subtotal)}</span>
            </div>
            {parseFloat(sale.discount) > 0 && (
              <div className="flex justify-end gap-8">
                <span className="text-muted-foreground">Descuento</span>
                <span className="text-red-600">-{formatCurrency(sale.discount)}</span>
              </div>
            )}
            {parseFloat(sale.tax) > 0 && (
              <div className="flex justify-end gap-8">
                <span className="text-muted-foreground">IVA</span>
                <span>{formatCurrency(sale.tax)}</span>
              </div>
            )}
            <div className="flex justify-end gap-8 font-bold text-base pt-1 items-center">
              <span>Total</span>
              <span className="flex items-center gap-2">
                {formatCurrency(sale.total)}
                {isSuperAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    title="Editar total de venta"
                    onClick={openEditTotal}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Pagos Registrados</CardTitle>
        </CardHeader>
        <CardContent>
          {sale.payments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Notas</TableHead>
                  {isSuperAdmin && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.paidAt)}</TableCell>
                    <TableCell>{p.method ? paymentMethodLabel[p.method] || p.method : "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.reference || "-"}</TableCell>
                    <TableCell className="text-right font-medium text-green-600">{formatCurrency(p.amount)}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">{p.notes || "-"}</TableCell>
                    {isSuperAdmin && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Editar pago"
                            onClick={() => openEditPayment(p)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Eliminar pago"
                            onClick={() => { setDeletePayment(p); setDeletePaymentError(""); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No hay pagos registrados para esta venta.</p>
          )}
        </CardContent>
      </Card>

      {/* Audit Log (SUPERADMIN only) */}
      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />Historial de Cambios Financieros
              </CardTitle>
              <Button variant="outline" size="sm" onClick={toggleAuditLogs}>
                {auditExpanded ? "Ocultar" : "Ver historial"}
              </Button>
            </div>
          </CardHeader>
          {auditExpanded && (
            <CardContent>
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 mb-4">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Este registro es inmutable y no puede ser modificado. Refleja todos los cambios realizados sobre los pagos y el total de esta venta.</span>
              </div>
              {auditLoading ? (
                <p className="text-sm text-muted-foreground">Cargando historial...</p>
              ) : auditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay cambios registrados para esta venta.</p>
              ) : (
                <div className="space-y-3">
                  {auditLogs.map((log) => {
                    const old = log.oldValues ? (() => { try { return JSON.parse(log.oldValues!); } catch { return null; } })() : null;
                    const nw = log.newValues ? (() => { try { return JSON.parse(log.newValues!); } catch { return null; } })() : null;
                    const isSaleEdit = log.paymentId === null && old?.total !== undefined;
                    return (
                      <div key={log.id} className="rounded-lg border p-3 text-sm space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={actionBadgeClass[log.action] || "bg-gray-100 text-gray-800 border-0"}>
                            {actionLabel[log.action] || log.action}
                          </Badge>
                          {isSaleEdit
                            ? <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex items-center gap-1"><DollarSign className="h-2.5 w-2.5" />Total de venta</Badge>
                            : <Badge variant="outline" className="text-[10px] px-1.5 py-0">Pago</Badge>
                          }
                          <span className="font-medium">{log.userName}</span>
                          <span className="text-muted-foreground text-xs">{log.userEmail}</span>
                          <span className="ml-auto text-muted-foreground text-xs">{formatDateTime(log.createdAt)}</span>
                        </div>
                        <p className="text-muted-foreground">{log.description}</p>
                        {(old || nw) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            {old && (
                              <div className="rounded bg-red-50 p-2 border border-red-100 text-red-900">
                                <p className="font-semibold text-red-700 mb-1">Antes</p>
                                {isSaleEdit ? (
                                  <>
                                    {old.total !== undefined && <p>Total: {formatCurrency(old.total)}</p>}
                                    {old.subtotal !== undefined && <p>Subtotal: {formatCurrency(old.subtotal)}</p>}
                                    {old.discount !== undefined && Number(old.discount) > 0 && <p>Descuento: {formatCurrency(old.discount)}</p>}
                                    {old.tax !== undefined && Number(old.tax) > 0 && <p>IVA: {formatCurrency(old.tax)}</p>}
                                  </>
                                ) : (
                                  <>
                                    {old.amount !== undefined && <p>Monto: {formatCurrency(old.amount)}</p>}
                                    {old.method && <p>Método: {paymentMethodLabel[old.method] || old.method}</p>}
                                    {old.reference && <p>Referencia: {old.reference}</p>}
                                    {old.notes && <p>Notas: {old.notes}</p>}
                                    {old.paidAt && <p>Fecha pago: {formatDate(old.paidAt)}</p>}
                                  </>
                                )}
                              </div>
                            )}
                            {nw && (
                              <div className="rounded bg-green-50 p-2 border border-green-100 text-green-900">
                                <p className="font-semibold text-green-700 mb-1">Después</p>
                                {isSaleEdit ? (
                                  <>
                                    {nw.total !== undefined && <p>Total: {formatCurrency(nw.total)}</p>}
                                    {nw.subtotal !== undefined && <p>Subtotal: {formatCurrency(nw.subtotal)}</p>}
                                    {nw.discount !== undefined && Number(nw.discount) > 0 && <p>Descuento: {formatCurrency(nw.discount)}</p>}
                                    {nw.tax !== undefined && Number(nw.tax) > 0 && <p>IVA: {formatCurrency(nw.tax)}</p>}
                                    {nw.reason && <p className="italic text-green-700">Motivo: {nw.reason}</p>}
                                  </>
                                ) : (
                                  <>
                                    {nw.amount !== undefined && <p>Monto: {formatCurrency(nw.amount)}</p>}
                                    {nw.method && <p>Método: {paymentMethodLabel[nw.method] || nw.method}</p>}
                                    {nw.reference && <p>Referencia: {nw.reference}</p>}
                                    {nw.notes && <p>Notas: {nw.notes}</p>}
                                    {nw.paidAt && <p>Fecha pago: {formatDate(nw.paidAt)}</p>}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Notes */}
      {sale.notes && (
        <Card>
          <CardHeader><CardTitle>Notas</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{sale.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Edit Sale Total Dialog */}
      <Dialog open={editTotalOpen} onOpenChange={(open) => { if (!open) setEditTotalOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />Editar Total de Venta #{sale.number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
              Estás modificando los montos de la venta. El cambio quedará registrado en el historial de cambios financieros.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Subtotal</Label>
                <Input
                  type="number"
                  value={editTotalForm.subtotal}
                  onChange={(e) => setEditTotalForm({ ...editTotalForm, subtotal: e.target.value })}
                  min={0}
                  step={0.01}
                />
              </div>
              <div>
                <Label>Descuento</Label>
                <Input
                  type="number"
                  value={editTotalForm.discount}
                  onChange={(e) => setEditTotalForm({ ...editTotalForm, discount: e.target.value })}
                  min={0}
                  step={0.01}
                />
              </div>
              <div>
                <Label>IVA</Label>
                <Input
                  type="number"
                  value={editTotalForm.tax}
                  onChange={(e) => setEditTotalForm({ ...editTotalForm, tax: e.target.value })}
                  min={0}
                  step={0.01}
                />
              </div>
              <div>
                <Label className="font-bold">Total</Label>
                <Input
                  type="number"
                  value={editTotalForm.total}
                  onChange={(e) => setEditTotalForm({ ...editTotalForm, total: e.target.value })}
                  min={0}
                  step={0.01}
                  className="font-bold"
                />
              </div>
            </div>
            <div>
              <Label>Motivo del cambio (opcional)</Label>
              <Textarea
                value={editTotalForm.reason}
                onChange={(e) => setEditTotalForm({ ...editTotalForm, reason: e.target.value })}
                placeholder="Ej: corrección de precio, acuerdo especial..."
                rows={2}
              />
            </div>
            {editTotalError && <p className="text-sm text-destructive">{editTotalError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTotalOpen(false)}>Cancelar</Button>
            <Button onClick={handleEditTotal} disabled={editTotalSaving || !editTotalForm.total}>
              {editTotalSaving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Dialog */}
      <Dialog open={!!editPayment} onOpenChange={(open) => { if (!open) setEditPayment(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />Editar Pago
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Monto</Label>
              <Input
                type="number"
                value={editForm.amount}
                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                min={0}
                step={0.01}
              />
            </div>
            <div>
              <Label>Método de pago</Label>
              <Select value={editForm.method} onValueChange={(v) => setEditForm({ ...editForm, method: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Efectivo</SelectItem>
                  <SelectItem value="TRANSFER">Transferencia</SelectItem>
                  <SelectItem value="CHECK">Cheque</SelectItem>
                  <SelectItem value="CARD">Tarjeta</SelectItem>
                  <SelectItem value="OTHER">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Referencia</Label>
              <Input
                value={editForm.reference}
                onChange={(e) => setEditForm({ ...editForm, reference: e.target.value })}
                placeholder="Número de transferencia, cheque, etc."
              />
            </div>
            <div>
              <Label>Fecha de pago</Label>
              <Input
                type="date"
                value={editForm.paidAt}
                onChange={(e) => setEditForm({ ...editForm, paidAt: e.target.value })}
              />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Observaciones adicionales..."
                rows={3}
              />
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPayment(null)}>Cancelar</Button>
            <Button onClick={handleEditPayment} disabled={editSaving || !editForm.amount}>
              {editSaving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Payment Dialog */}
      <Dialog open={!!deletePayment} onOpenChange={(open) => { if (!open) setDeletePayment(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />Eliminar Pago
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Vas a eliminar el pago de{" "}
              <strong className="text-foreground">{formatCurrency(deletePayment?.amount ?? 0)}</strong>{" "}
              registrado el{" "}
              <strong className="text-foreground">{deletePayment ? formatDate(deletePayment.paidAt) : ""}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              El pago será eliminado pero quedará registrado en el historial de cambios de esta venta. <strong className="text-foreground">Esta acción no se puede deshacer.</strong>
            </p>
            {deletePaymentError && <p className="text-sm text-destructive">{deletePaymentError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePayment(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeletePayment} disabled={deletingPayment}>
              {deletingPayment ? "Eliminando..." : "Eliminar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Sale Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />Eliminar Venta #{sale.number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Esta acción eliminará permanentemente la venta, sus pagos asociados y el remito. <strong className="text-foreground">No se puede recuperar.</strong>
            </p>
            <div className="space-y-2">
              <Label>Escribí el nombre del cliente para confirmar:</Label>
              <p className="text-xs text-muted-foreground">Cliente: <strong>{contactName}</strong></p>
              <Input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder="Escriba el nombre del cliente..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeleteConfirmName(""); }}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || deleteConfirmName.trim().toLowerCase() !== contactName.toLowerCase()}
            >
              {deleting ? "Eliminando..." : "Eliminar Venta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
