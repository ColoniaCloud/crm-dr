"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, CheckCircle2, Copy, FileText, Mail, MessageCircle, Share2 } from "@/components/icons";

interface ShareInfo {
  url: string;
  remitoNumber: number;
  signed: boolean;
  contact: { name: string; email: string | null; phone: string | null };
  whatsappUrl: string | null;
  message: string;
}

/**
 * Mandar un remito desde el listado sin entrar a la venta: el link público
 * (copiar, WhatsApp, compartir), el PDF como archivo (menú de compartir del
 * sistema, o descarga donde no existe) o el mail, que lleva el PDF adjunto.
 * Los mismos endpoints que la pantalla del remito (sales/[id]/remito).
 *
 * El link se genera recién al abrir el diálogo: un remito que nunca se manda
 * nunca tiene URL pública (ver api/remitos/[id]/link).
 */
export function RemitoSendDialog({
  remitoId,
  remitoNumber,
  open,
  onOpenChange,
}: {
  remitoId: string;
  remitoNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);

  useEffect(() => {
    // Quien lo usa lo monta recién al abrirlo: el estado arranca limpio.
    if (!open) return;
    (async () => {
      try {
        const res = await fetch(`/api/remitos/${remitoId}/link`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "No se pudo generar el link");
        setShare(data);
        setEmail(data.contact?.email || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo generar el link");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, remitoId]);

  async function copyLink() {
    if (!share) return;
    await navigator.clipboard.writeText(share.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareLink() {
    if (!share) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Remito Kristall Film", text: share.message, url: share.url });
      } catch {
        /* cancelado: no pasa nada */
      }
      return;
    }
    await navigator.clipboard.writeText(share.message).catch(() => {});
    setNotice("Mensaje copiado: pegalo donde quieras.");
  }

  // El PDF como archivo, para mandarlo por WhatsApp u otra app desde el menú
  // del sistema (celular). Donde no se pueden compartir archivos, se descarga.
  async function sharePdf() {
    if (sharingPdf) return;
    setSharingPdf(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/remitos/${remitoId}/pdf`);
      if (!res.ok) throw new Error("No se pudo generar el PDF");
      const blob = await res.blob();
      const name = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `remito-${remitoNumber}.pdf`;
      const file = new File([blob], name, { type: "application/pdf" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Remito N° ${remitoNumber}` });
        } catch {
          /* cancelado */
        }
        return;
      }
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setNotice("Este navegador no comparte archivos: el PDF se descargó para que lo adjuntes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el PDF");
    } finally {
      setSharingPdf(false);
    }
  }

  async function sendEmail() {
    if (sending) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/remitos/${remitoId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email ? { email } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo enviar el mail");
      setNotice(`Remito enviado a ${data.sentTo}, con el PDF adjunto.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el mail");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar Remito N° {remitoNumber}</DialogTitle>
          <DialogDescription>
            {share
              ? share.signed
                ? `La copia firmada${share.contact.name ? ` para ${share.contact.name}` : ""}.`
                : `El link para que ${share.contact.name || "el cliente"} lo revise y lo firme.`
              : "Mandalo como link o como PDF."}
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground py-4 text-center">Generando link...</p>}
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        {notice && (
          <div className="flex items-center gap-2 rounded-md border border-green-600/30 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />{notice}
          </div>
        )}

        {share && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Link</Label>
              <div className="flex items-center gap-2 rounded-md border p-2 text-xs">
                <span className="truncate text-muted-foreground flex-1">{share.url}</span>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={copyLink} title="Copiar link">
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
                <Button variant="outline" size="sm" onClick={shareLink}>
                  <Share2 className="h-4 w-4 mr-1" />Compartir link
                </Button>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">PDF</Label>
              <div>
                <Button variant="outline" size="sm" onClick={sharePdf} disabled={sharingPdf}>
                  <FileText className="h-4 w-4 mr-1" />{sharingPdf ? "Generando..." : "Compartir PDF"}
                </Button>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Por mail (link + PDF adjunto)</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input type="email" placeholder="email@cliente.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Button variant="outline" onClick={sendEmail} disabled={sending || !email}>
                  <Mail className="h-4 w-4 mr-1" />{sending ? "Enviando..." : "Enviar"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
