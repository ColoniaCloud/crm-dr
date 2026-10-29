"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, QrCode } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * QR del SKU para las etiquetas de trazabilidad de las cajas. El contenido es
 * el SKU tal cual, sin URL ni prefijo: el POS lee el texto del QR y lo busca
 * por SKU exacto (`/api/mobile/v1/products?sku=`). Si se cambia el formato acá,
 * deja de encontrar el producto.
 */
const QR_OPTIONS = { errorCorrectionLevel: "M" as const, margin: 2 };

/** PNG para imprimir: el QR grande y debajo el SKU legible, por si el lector falla. */
async function buildLabelPng(sku: string, name: string): Promise<string> {
  const qrSize = 800;
  const qr = await QRCode.toDataURL(sku, { ...QR_OPTIONS, width: qrSize });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = qr;
  });

  const canvas = document.createElement("canvas");
  canvas.width = qrSize;
  canvas.height = qrSize + 170;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, qrSize, qrSize);
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.font = "bold 72px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillText(sku, qrSize / 2, qrSize + 70, qrSize - 40);
  ctx.font = "40px system-ui, sans-serif";
  ctx.fillText(name, qrSize / 2, qrSize + 135, qrSize - 40);
  return canvas.toDataURL("image/png");
}

export function ProductSkuQr({ sku, name }: { sku: string | null; name: string }) {
  // Se guarda junto al SKU que lo generó: si el SKU cambia, el QR viejo deja de mostrarse solo.
  const [rendered, setRendered] = useState<{ sku: string; url: string } | null>(null);
  const preview = sku && rendered?.sku === sku ? rendered.url : null;
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!sku) return;
    let cancelled = false;
    QRCode.toDataURL(sku, { ...QR_OPTIONS, width: 320 })
      .then((url) => { if (!cancelled) setRendered({ sku, url }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sku]);

  async function download() {
    if (!sku) return;
    setDownloading(true);
    try {
      const url = await buildLabelPng(sku, name);
      const a = document.createElement("a");
      a.href = url;
      a.download = `QR-${sku.replace(/[^\w.-]+/g, "_")}.png`;
      a.click();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <QrCode size={18} className="text-primary" /> QR de trazabilidad
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        {sku ? (
          <>
            <div className="rounded-lg bg-white p-2">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt={`QR del SKU ${sku}`} width={160} height={160} className="h-40 w-40" />
              ) : (
                <div className="h-40 w-40 animate-pulse rounded bg-zinc-200" />
              )}
            </div>
            <p className="font-mono text-sm font-semibold">{sku}</p>
            <Button variant="outline" onClick={download} disabled={downloading || !preview} className="gap-2">
              <Download size={15} />
              Descargar QR
            </Button>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Este producto no tiene SKU. Cargalo con &quot;Editar producto&quot; para generar su QR.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
