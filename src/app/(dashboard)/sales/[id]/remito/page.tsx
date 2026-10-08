"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignaturePad } from "@/components/signature-pad";
import { formatDateTime } from "@/lib/utils";
import { saleProgress, SALE_PROGRESS_LABEL, SALE_PROGRESS_BADGE_CLASS } from "@/lib/sale-progress";
import { takeSaleFlash } from "@/lib/sale-flash";
import {
  AlertTriangle, Check, ChevronLeft, Copy, Download, Mail, MessageCircle, PenLine, Share2, CheckCircle2,
} from "lucide-react";

/**
 * La pantalla del remito: a donde lleva crear una venta confirmada, y lo que
 * abre "Remito" desde la ficha. Todo lo que se puede hacer con el remito en un
 * solo lugar (REMITOS-FIRMA.md, fase 3):
 *
 * - Firmar acá: el cliente firma en esta pantalla, delante de quien vende.
 * - QR y link: el cliente lo abre en su celular y firma ahí.
 * - WhatsApp (wa.me), email, compartir, PDF.
 *
 * Firmar es entregar: cualquiera de las firmas pasa la venta a entregada.
 */

interface SaleLite {
  id: string;
  number: number;
  status: string;
  contact: { firstName: string; lastName: string; company: string | null; email: string | null };
  remito: {
    id: string;
    number: number;
    signedAt: string | null;
    signedVia: string | null;
    signedByName: string | null;
  } | null;
}

interface ShareInfo {
  url: string;
  qrSvg: string;
  signed: boolean;
  contact: { name: string; email: string | null; phone: string | null };
  whatsappUrl: string | null;
  message: string;
}

const VIA_LABEL: Record<string, string> = {
  ONLINE: "online",
  POS: "en el punto de venta",
  PAPER: "en papel",
};

export default function RemitoPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const saleId = params.id as string;
  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN";

  const [sale, setSale] = useState<SaleLite | null>(null);
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const [signOpen, setSignOpen] = useState(false);

  useEffect(() => {
    setFlash(takeSaleFlash(saleId));
  }, [saleId]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sales/${saleId}`);
      if (!res.ok) throw new Error("No se pudo cargar la venta");
      const s: SaleLite = await res.json();
      setSale(s);
      setEmail((prev) => prev || s.contact.email || "");
      // El link (y su QR) solo tiene sentido si hay algo para firmar o para
      // mandar: una venta anulada sin firma no lo genera.
      if (s.remito && !(s.status === "CANCELLED" && !s.remito.signedAt)) {
        const lr = await fetch(`/api/remitos/${s.remito.id}/link`, { method: "POST" });
        if (lr.ok) setShare(await lr.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el remito");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId]);

  async function sendEmail() {
    if (!sale?.remito || sending) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/remitos/${sale.remito.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email ? { email } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo enviar el mail");
      setNotice(`Remito enviado a ${data.sentTo}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el mail");
    } finally {
      setSending(false);
    }
  }

  async function copyLink() {
    if (!share) return;
    await navigator.clipboard.writeText(share.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // El menú de compartir del sistema donde existe (celular, Safari); en el
  // resto se copia el mensaje entero, listo para pegar en cualquier lado.
  async function shareNative() {
    if (!share) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Remito Kristall Film", text: share.message, url: share.url });
        return;
      } catch {
        /* cancelado: no pasa nada */
        return;
      }
    }
    await navigator.clipboard.writeText(share.message).catch(() => {});
    setNotice("Mensaje copiado: pegalo donde quieras.");
  }

  if (loading && !sale) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!sale || !sale.remito) {
    return <div className="rounded-md bg-red-50 p-4 text-red-600">{error || "Esta venta no tiene remito"}</div>;
  }

  const remito = sale.remito;
  const progress = saleProgress(sale.status, remito);
  const signed = !!remito.signedAt;
  const cancelled = sale.status === "CANCELLED";
  const contactName = sale.contact.company || `${sale.contact.firstName} ${sale.contact.lastName}`.trim();

  return (
    <div className="space-y-6 p-1 max-w-5xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="p-0 h-auto text-muted-foreground hover:text-foreground mb-1" onClick={() => router.push(`/sales/${sale.id}`)}>
            <ChevronLeft className="h-4 w-4" />Venta #{sale.number}
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold">Remito N° {remito.number}</h1>
          <p className="text-sm text-muted-foreground mt-1">{contactName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={SALE_PROGRESS_BADGE_CLASS[progress]}>{SALE_PROGRESS_LABEL[progress]}</Badge>
          <Button variant="outline" size="sm" onClick={() => window.location.assign(`/api/remitos/${remito.id}/pdf`)}>
            <Download className="h-4 w-4 mr-1" />{signed ? "PDF firmado" : "Descargar PDF"}
          </Button>
        </div>
      </div>

      {flash.map((aviso, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />{aviso}
        </div>
      ))}
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      {notice && (
        <div className="flex items-center gap-2 rounded-md border border-green-600/30 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />{notice}
        </div>
      )}

      {cancelled && !signed ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            La venta está anulada: el remito no se firma ni se manda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {signed ? "Firmado" : "Que lo firme el cliente"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {signed ? (
                <p className="text-sm">
                  Firmado {VIA_LABEL[remito.signedVia ?? "PAPER"] ?? ""} el {formatDateTime(remito.signedAt!)}
                  {remito.signedByName && <> por <strong>{remito.signedByName}</strong></>}. La venta quedó entregada.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Si el cliente está acá, que firme en esta pantalla. Si no, mandale el link y lo firma desde su
                    celular cuando reciba el pedido. Firmar marca la venta como entregada.
                  </p>
                  {isAdmin && (
                    <Button onClick={() => setSignOpen(true)}>
                      <PenLine className="h-4 w-4 mr-2" />Firmar acá
                    </Button>
                  )}
                </div>
              )}

              {share && (
                <div className="space-y-3 border-t pt-5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    {signed ? "Mandar la copia firmada" : "Mandar el link para firmar"}
                  </Label>
                  <div className="flex items-center gap-2 rounded-md border p-2 text-xs">
                    <span className="truncate text-muted-foreground flex-1">{share.url}</span>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={copyLink}>
                      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {share.whatsappUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={share.whatsappUrl} target="_blank" rel="noreferrer">
                          <MessageCircle className="h-4 w-4 mr-1" />WhatsApp
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled title="El contacto no tiene teléfono cargado">
                        <MessageCircle className="h-4 w-4 mr-1" />WhatsApp
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={shareNative}>
                      <Share2 className="h-4 w-4 mr-1" />Compartir
                    </Button>
                  </div>
                  {!share.whatsappUrl && (
                    <p className="text-xs text-muted-foreground">El contacto no tiene teléfono: usá Compartir o el mail.</p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      type="email"
                      placeholder="email@cliente.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="sm:max-w-xs"
                    />
                    <Button variant="outline" onClick={sendEmail} disabled={sending || !email}>
                      <Mail className="h-4 w-4 mr-1" />{sending ? "Enviando..." : "Enviar por mail"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {share && !signed && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Escanear para firmar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* El SVG lo arma el servidor con `qrcode`: solo rectángulos, sin texto del usuario. */}
                <div
                  className="mx-auto w-56 rounded-md bg-white p-2"
                  dangerouslySetInnerHTML={{ __html: share.qrSvg }}
                />
                <p className="text-xs text-center text-muted-foreground">
                  El cliente lo escanea con la cámara del celular y firma ahí.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <FirmarAquiDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        remitoId={remito.id}
        contactEmail={sale.contact.email}
        onSigned={(msg) => {
          setSignOpen(false);
          setNotice(msg);
          load();
        }}
      />
    </div>
  );
}

function FirmarAquiDialog({
  open,
  onOpenChange,
  remitoId,
  contactEmail,
  onSigned,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  remitoId: string;
  contactEmail: string | null;
  onSigned: (message: string) => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dni, setDni] = useState("");
  const [email, setEmail] = useState("");
  const [saveEmail, setSaveEmail] = useState(true);
  const [conforme, setConforme] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // El recuadro se vuelve a montar cada vez que se abre: una firma a medias de
  // otra apertura no tiene que quedar dibujada.
  const [padKey, setPadKey] = useState(0);

  useEffect(() => {
    if (open) {
      setImage(null);
      setConforme(false);
      setError("");
      setPadKey((k) => k + 1);
    }
  }, [open]);

  const listo = !!image && name.trim().length >= 3 && conforme && !saving;

  async function submit() {
    if (!listo) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/remitos/${remitoId}/sign-here`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: image,
          name,
          dni: dni || null,
          email: contactEmail ? null : email || null,
          saveEmail: !contactEmail && !!email && saveEmail,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo registrar la firma");
      const partes = ["Remito firmado: la venta quedó entregada."];
      if (data.sentTo) partes.push(`Copia enviada a ${data.sentTo}.`);
      if (data.emailSaved) partes.push("El email quedó guardado en la ficha.");
      if (Array.isArray(data.sinRollo) && data.sinRollo.length > 0) {
        partes.push(`Ojo: quedaron sin rollo de garantía: ${data.sinRollo.join(", ")}.`);
      }
      onSigned(partes.join(" "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la firma");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Firma del cliente</DialogTitle>
          <DialogDescription>
            Pasale la pantalla al cliente. Al firmar, la venta queda entregada y el remito ya no se puede modificar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <SignaturePad key={padKey} onChange={setImage} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="firmaNombre">Nombre y apellido</Label>
              <Input id="firmaNombre" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="firmaDni">DNI (opcional)</Label>
              <Input id="firmaDni" value={dni} onChange={(e) => setDni(e.target.value)} inputMode="numeric" />
            </div>
          </div>
          {contactEmail ? (
            <p className="text-xs text-muted-foreground">La copia firmada va a {contactEmail}.</p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="firmaEmail">Email para la copia (opcional)</Label>
              <Input id="firmaEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {email && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={saveEmail} onChange={(e) => setSaveEmail(e.target.checked)} className="h-3.5 w-3.5" />
                  Guardarlo en la ficha del cliente
                </label>
              )}
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={conforme} onChange={(e) => setConforme(e.target.checked)} className="mt-0.5 h-4 w-4" />
            Recibí los productos detallados en el remito, en conformidad.
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={!listo}>
            <PenLine className="h-4 w-4 mr-1" />{saving ? "Firmando..." : "Firmar remito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
