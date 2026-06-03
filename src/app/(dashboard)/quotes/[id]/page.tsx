"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";
import { ArrowLeft, ShoppingCart, Download, Send, Mail, AlertTriangle } from "lucide-react";
import { downloadQuotePDF, getQuotePDFBase64 } from "@/components/quote-pdf";
import Link from "next/link";

interface QuoteDetail {
  id: string;
  number: number;
  contact: { firstName: string; lastName: string; company: string | null; email: string | null; address: string | null; city: string | null; state: string | null };
  status: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  requiresFactura: boolean;
  notes: string | null;
  sentAt: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    product: { name: string; category: string };
    quantity: number;
    unitPrice: string;
    total: string;
    discount: string;
    discountType: string;
  }>;
}

const statusLabels: Record<string, string> = {
  DRAFT: "Borrador", SENT: "Enviado", ACCEPTED: "Aceptado", REJECTED: "Rechazado", CONVERTED: "Convertido",
};

export default function QuoteDetailPage() {
  const { format: formatCurrency } = useCurrency();
  const params = useParams();
  const router = useRouter();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");

  useEffect(() => { fetchQuote(); }, [params.id]);

  async function fetchQuote() {
    try {
      const res = await fetch(`/api/quotes/${params.id}`);
      setQuote(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleConvert() {
    setConverting(true);
    try {
      const res = await fetch(`/api/quotes/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert" }),
      });
      if (res.ok) router.push("/sales");
    } catch (err) { console.error(err); }
    finally { setConverting(false); }
  }

  async function updateStatus(status: string) {
    try {
      await fetch(`/api/quotes/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchQuote();
    } catch (err) { console.error(err); }
  }

  async function handleDownload() {
    if (!quote) return;
    await downloadQuotePDF({
      number: quote.number,
      createdAt: quote.createdAt,
      contact: quote.contact,
      subtotal: quote.subtotal,
      discount: quote.discount,
      total: quote.total,
      tax: quote.tax,
      requiresFactura: quote.requiresFactura,
      notes: quote.notes,
      items: quote.items.map((i) => ({
        product: i.product,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.total,
        discount: Number(i.discount),
        discountType: i.discountType,
      })),
    });
  }

  async function handleSendEmail() {
    if (!quote) return;
    setSendError("");
    setSendSuccess("");
    setSendingEmail(true);
    try {
      const pdfBase64 = await getQuotePDFBase64({
        number: quote.number,
        createdAt: quote.createdAt,
        contact: quote.contact,
        subtotal: quote.subtotal,
        discount: quote.discount,
        total: quote.total,
        tax: quote.tax,
        requiresFactura: quote.requiresFactura,
        notes: quote.notes,
        items: quote.items.map((i) => ({
          product: i.product,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.total,
          discount: Number(i.discount),
          discountType: i.discountType,
        })),
      });
      const res = await fetch(`/api/quotes/${params.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Error al enviar");
      }
      setSendSuccess("Presupuesto enviado por email correctamente");
      fetchQuote();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Error al enviar email");
    } finally {
      setSendingEmail(false);
    }
  }

  if (loading) return <div className="p-8">Cargando...</div>;
  if (!quote) return <div className="p-8">Presupuesto no encontrado</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/quotes"><Button variant="ghost" size="icon" aria-label="Volver a presupuestos"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold">Presupuesto #{quote.number}</h1>
        <Badge>{statusLabels[quote.status]}</Badge>
        {quote.sentAt && <Badge variant="default" className="gap-1"><Mail className="h-3 w-3" />Enviado</Badge>}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" />Descargar PDF
          </Button>
          {quote.status !== "CONVERTED" && (
            <Button variant="default" size="sm" onClick={handleSendEmail} disabled={sendingEmail}>
              <Send className="h-4 w-4 mr-1" />{sendingEmail ? "Enviando..." : "Enviar por Email"}
            </Button>
          )}
        </div>
      </div>

      {sendError && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{sendError}</div>}
      {sendSuccess && <div className="rounded-md bg-green-50 p-3 text-sm text-green-600">{sendSuccess}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Información</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Cliente:</span> {quote.contact?.firstName} {quote.contact?.lastName}</p>
            <p><span className="text-muted-foreground">Empresa:</span> {quote.contact?.company || "-"}</p>
            <p><span className="text-muted-foreground">Fecha:</span> {formatDate(quote.createdAt)}</p>
            {quote.notes && <p><span className="text-muted-foreground">Notas:</span> {quote.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Acciones</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {quote.status === "DRAFT" && (
              <Button className="w-full" variant="outline" onClick={() => updateStatus("SENT")}>Marcar como Enviado</Button>
            )}
            {(quote.status === "DRAFT" || quote.status === "SENT") && (
              <Button className="w-full" onClick={handleSendEmail} disabled={sendingEmail}>
                <Send className="h-4 w-4 mr-2" />{sendingEmail ? "Enviando..." : "Enviar por Email"}
              </Button>
            )}
            {quote.status === "SENT" && (
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => updateStatus("ACCEPTED")}>Aceptar</Button>
                <Button className="flex-1" variant="destructive" onClick={() => updateStatus("REJECTED")}>Rechazar</Button>
              </div>
            )}
            {quote.status === "ACCEPTED" && (
              <Button className="w-full" onClick={handleConvert} disabled={converting}>
                <ShoppingCart className="h-4 w-4 mr-2" />{converting ? "Convirtiendo..." : "Convertir a Venta"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Precio Unit.</TableHead>
                <TableHead>Descuento</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quote.items?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.product?.name}</TableCell>
                  <TableCell><Badge variant="outline">{item.product?.category}</Badge></TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                  <TableCell>
                    {Number(item.discount) > 0
                      ? item.discountType === "PERCENT" ? `${item.discount}%` : formatCurrency(item.discount)
                      : "-"}
                  </TableCell>
                  <TableCell>{formatCurrency(item.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 text-right space-y-1">
            {quote.requiresFactura && Number(quote.tax) > 0 && (
              <>
                <p className="text-sm text-muted-foreground">Subtotal: {formatCurrency(quote.subtotal)}</p>
                <p className="text-sm text-muted-foreground">IVA (21%): {formatCurrency(quote.tax)}</p>
              </>
            )}
            <p className="text-xl font-bold">Total: {formatCurrency(quote.total)}</p>
            {!quote.requiresFactura && (
              <div className="flex items-center justify-end gap-2 mt-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-600">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Los precios expresados en la lista no incluyen el IVA (21%).
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
