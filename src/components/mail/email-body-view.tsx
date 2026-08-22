"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ImageOff, Code2, FileText, Maximize2, Minimize2, Paperclip, Download,
  File as FileIcon, FileImage, FileArchive, FileSpreadsheet, AlignLeft,
} from "lucide-react";

interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** false cuando el archivo se purgó por retención: la fila queda, el archivo no. */
  available: boolean;
}

interface EmailDetail {
  bodyText: string | null;
  hasHtml: boolean;
  /** Documento completo ya sanitizado en el servidor, listo para el srcdoc. */
  frameDocument: string | null;
  blockedImages: number;
  unresolvedInlineImages: number;
  remoteImagesAllowed: boolean;
  attachments: EmailAttachment[];
  rawStorageKey: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentIcon(contentType: string) {
  if (contentType.startsWith("image/")) return FileImage;
  if (contentType === "application/pdf") return FileText;
  if (/zip|compressed|tar|rar|7z/.test(contentType)) return FileArchive;
  if (/sheet|excel|csv/.test(contentType)) return FileSpreadsheet;
  return FileIcon;
}

/**
 * Muestra el cuerpo de un email con su formato original.
 *
 * El HTML llega ya sanitizado desde `GET /api/mail/:id` y se inyecta en un
 * iframe con `sandbox` SIN `allow-scripts` ni `allow-same-origin`. Esa es la
 * garantía real: aunque algo se escape del sanitizador, el contenido no puede
 * leer el DOM del CRM, ni la cookie de sesión, ni navegar la ventana padre.
 *
 * El iframe no puede auto-ajustar su altura sin scripts adentro (y meterle
 * scripts es exactamente lo que estamos evitando), así que va con alto fijo y
 * scroll interno, más un botón para expandir.
 *
 * El padre lo monta con `key={email.id}`, así que cambiar de mail remonta el
 * componente y los toggles vuelven solos al estado seguro — las imágenes
 * remotas no quedan desbloqueadas de un mail al siguiente.
 */
export function EmailBodyView({ emailId }: { emailId: string }) {
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showRemoteImages, setShowRemoteImages] = useState(false);
  const [plainText, setPlainText] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `/api/mail/${emailId}${showRemoteImages ? "?images=1" : ""}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(String(res.status));
        const data: EmailDetail = await res.json();
        setDetail(data);
        setError(false);
      } catch {
        // Un abort es un cambio de mail, no un fallo: no se muestra error.
        if (controller.signal.aborted) return;
        setDetail(null);
        setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [emailId, showRemoteImages, retryNonce]);

  if (loading) {
    return <p className="border-t pt-3 text-sm text-muted-foreground">Cargando el mensaje...</p>;
  }

  if (error || !detail) {
    return (
      <div className="border-t pt-3 space-y-2">
        <p className="text-sm text-red-600">No se pudo cargar el cuerpo del mensaje.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            setRetryNonce((n) => n + 1);
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  const showingHtml = Boolean(detail.hasHtml && detail.frameDocument && !plainText);

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {detail.hasHtml && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setPlainText((v) => !v)}
          >
            {plainText ? <Code2 className="h-3.5 w-3.5" /> : <AlignLeft className="h-3.5 w-3.5" />}
            {plainText ? "Ver formato original" : "Ver texto plano"}
          </Button>
        )}
        {showingHtml && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {expanded ? "Contraer" : "Expandir"}
          </Button>
        )}
      </div>

      {detail.blockedImages > 0 && !detail.remoteImagesAllowed && showingHtml && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <ImageOff className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            Se bloquearon {detail.blockedImages}{" "}
            {detail.blockedImages === 1 ? "imagen remota" : "imágenes remotas"}. Al mostrarlas, el
            remitente puede saber que abriste el mensaje.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setLoading(true);
              setShowRemoteImages(true);
            }}
          >
            Mostrar imágenes
          </Button>
        </div>
      )}

      {detail.unresolvedInlineImages > 0 && showingHtml && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          {detail.unresolvedInlineImages}{" "}
          {detail.unresolvedInlineImages === 1
            ? "imagen incrustada no se pudo mostrar"
            : "imágenes incrustadas no se pudieron mostrar"}{" "}
          (el archivo no llegó o superó el tamaño máximo).
        </p>
      )}

      {detail.attachments.length > 0 && (
        <ul className="space-y-1">
          {detail.attachments.map((a) => {
            const Icon = attachmentIcon(a.contentType);
            return (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{a.filename}</span>
                  <span className="shrink-0 text-muted-foreground">({formatBytes(a.sizeBytes)})</span>
                </span>
                {a.available ? (
                  <a
                    href={`/api/mail/${emailId}/attachments/${a.id}`}
                    download={a.filename}
                    className="flex shrink-0 items-center gap-1 text-primary hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Descargar
                  </a>
                ) : (
                  <span className="shrink-0 text-muted-foreground">eliminado por retención</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showingHtml ? (
        <iframe
          // Sin este key el navegador reusa el documento anterior al desbloquear
          // las imágenes y el srcdoc nuevo no se aplica.
          key={`${emailId}-${detail.remoteImagesAllowed}`}
          title="Cuerpo del mensaje"
          srcDoc={detail.frameDocument ?? ""}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className={`w-full rounded-md border bg-white transition-[height] dark:bg-neutral-950 ${
            expanded ? "h-[70vh]" : "h-[380px]"
          }`}
        />
      ) : (
        <div className="whitespace-pre-wrap text-sm">
          {detail.bodyText || <span className="text-muted-foreground">(sin contenido)</span>}
        </div>
      )}
    </div>
  );
}
