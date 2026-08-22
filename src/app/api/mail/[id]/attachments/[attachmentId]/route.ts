import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { readStoredFile, contentDispositionFilename } from "@/lib/mail-attachments";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mail/[id]/attachments/[attachmentId]");

/**
 * Descarga un adjunto.
 *
 * El `storageKey` nunca llega del cliente: se resuelve desde la base a partir
 * del par (emailId, attachmentId), y el email tiene que ser del operador
 * logueado. Así un id adivinado de otra casilla devuelve 404, no el archivo.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id, attachmentId } = await params;

    const attachment = await prisma.emailAttachment.findFirst({
      where: {
        id: attachmentId,
        emailId: id,
        // El aislamiento entre operadores: cada uno solo ve su propia casilla.
        email: { userId: session.user.id },
      },
    });

    if (!attachment) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    if (!attachment.storageKey) {
      return NextResponse.json(
        { error: "El archivo se eliminó por política de retención" },
        { status: 410 }
      );
    }

    const data = await readStoredFile(attachment.storageKey);
    const inline = attachment.isInline || attachment.contentType.startsWith("image/");

    return new NextResponse(new Uint8Array(data), {
      headers: {
        // El Content-Type sale de la base, nunca del archivo: si un remitente
        // manda un .html disfrazado, se sirve con el tipo que declaró el mail.
        "Content-Type": attachment.contentType,
        // Y aunque lo declare mal, nosniff impide que el navegador lo
        // reinterprete y termine ejecutando HTML en nuestro origen.
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; ${contentDispositionFilename(attachment.filename)}`,
        "Content-Length": String(data.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    log.error({ err: error }, "Error serving attachment");
    return NextResponse.json({ error: "Error al descargar el adjunto" }, { status: 500 });
  }
}
