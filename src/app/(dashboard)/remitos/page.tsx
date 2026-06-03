"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { downloadRemitoPDF } from "@/components/remito-pdf";
import { Download, CheckCircle2, Clock, PenLine } from "lucide-react";

interface RemitoRaw {
  id: string;
  number: number;
  issuedAt: string;
  signedAt: string | null;
  notes: string | null;
  facturaInfo: string | null;
  sale: {
    number: number;
    status: string;
    total: number;
    subtotal: number;
    discount: number;
    tax: number;
    requiresFactura: boolean;
    contact: {
      firstName: string;
      lastName: string;
      company: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
    };
    items: Array<{
      quantity: number;
      unitPrice: number;
      total: number;
      product: { name: string; category: string };
    }>;
  };
}

function RemitosPageInner() {
  const searchParams = useSearchParams();
  const saleIdFilter = searchParams.get("saleId");

  const [remitos, setRemitos] = useState<RemitoRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRemitos() {
      try {
        const params = new URLSearchParams();
        if (saleIdFilter) params.set("saleId", saleIdFilter);
        const res = await fetch(`/api/remitos?${params}`);
        if (!res.ok) throw new Error("Error al cargar remitos");
        setRemitos(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    }
    fetchRemitos();
  }, [saleIdFilter]);

  function handleDownloadPDF(remito: RemitoRaw) {
    setDownloadingId(remito.id);
    try {
      downloadRemitoPDF(remito);
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleSign(remito: RemitoRaw) {
    if (!confirm(`¿Confirmar firma del Remito #${remito.number}? Esto marcará la venta como entregada.`)) return;
    setSigningId(remito.id);
    try {
      const res = await fetch(`/api/remitos/${remito.id}/sign`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Error al firmar remito");
        return;
      }
      setRemitos((prev) =>
        prev.map((r) =>
          r.id === remito.id
            ? { ...r, signedAt: new Date().toISOString(), sale: { ...r.sale, status: "DELIVERED" } }
            : r
        )
      );
    } catch {
      alert("Error al firmar remito");
    } finally {
      setSigningId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold">Remitos</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando remitos...</p>
          ) : error ? (
            <div className="rounded-md bg-red-50 p-4 text-red-600">{error}</div>
          ) : (
            <>
            {/* ── Vista móvil ── */}
            <div className="md:hidden space-y-2">
              {remitos.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No hay remitos registrados</p>}
              {remitos.map((remito) => (
                <div key={remito.id} className="rounded-lg border px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">
                      <span className="font-mono text-[10px] text-muted-foreground mr-1.5">{remito.number}</span>
                      {remito.sale?.contact
                        ? `${remito.sale.contact.firstName} ${remito.sale.contact.lastName}${remito.sale.contact.company ? ` (${remito.sale.contact.company})` : ""}`
                        : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {remito.signedAt ? (
                      <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[10px] px-1.5 py-0">
                        <CheckCircle2 className="size-2.5 mr-0.5" />Firmado
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-yellow-400 border-yellow-600/30 text-[10px] px-1.5 py-0">
                        <Clock className="size-2.5 mr-0.5" />Pendiente
                      </Badge>
                    )}
                    <span className="text-muted-foreground">Venta #{remito.sale?.number}</span>
                    <span className="text-muted-foreground">{formatDate(remito.issuedAt)}</span>
                  </div>
                  <div className="flex gap-2 pt-0.5">
                    {!remito.signedAt && (
                      <Button variant="outline" size="sm" onClick={() => handleSign(remito)} disabled={signingId === remito.id} className="h-7 text-xs text-green-400 border-green-600/30 hover:bg-green-600/10">
                        <PenLine className="h-3 w-3 mr-1" />{signingId === remito.id ? "Firmando..." : "Firmar"}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleDownloadPDF(remito)} disabled={downloadingId === remito.id} className="h-7 text-xs">
                      <Download className="h-3 w-3 mr-1" />{downloadingId === remito.id ? "..." : "PDF"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Vista desktop ── */}
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#Remito</TableHead>
                  <TableHead>#Venta</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {remitos.map((remito) => (
                  <TableRow key={remito.id}>
                    <TableCell className="font-medium">{remito.number}</TableCell>
                    <TableCell>{remito.sale?.number}</TableCell>
                    <TableCell>
                      {remito.sale?.contact
                        ? `${remito.sale.contact.firstName} ${remito.sale.contact.lastName}${remito.sale.contact.company ? ` (${remito.sale.contact.company})` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell>{formatDate(remito.issuedAt)}</TableCell>
                    <TableCell>
                      {remito.signedAt ? (
                        <Badge className="bg-green-600/20 text-green-400 border-green-600/30">
                          <CheckCircle2 className="size-3 mr-1" />
                          Firmado {formatDate(remito.signedAt)}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-yellow-400 border-yellow-600/30">
                          <Clock className="size-3 mr-1" />
                          Pendiente de firma
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {(remito.sale?.items ?? []).map((i) => `${i.product.name} x${i.quantity}`).join(", ")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {!remito.signedAt && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSign(remito)}
                            disabled={signingId === remito.id}
                            className="text-green-400 border-green-600/30 hover:bg-green-600/10"
                          >
                            <PenLine className="h-4 w-4 mr-1" />
                            {signingId === remito.id ? "Firmando..." : "Firmar"}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadPDF(remito)}
                          disabled={downloadingId === remito.id}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          {downloadingId === remito.id ? "Generando..." : "PDF"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {remitos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No hay remitos registrados
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

export default function RemitosPage() {
  return (
    <Suspense>
      <RemitosPageInner />
    </Suspense>
  );
}
