import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { WHATSAPP_ROLES } from "@/lib/whatsapp/access";
import { createLogger } from "@/lib/logger";
import { WhatsAppApiError, downloadMedia, isCloudApiConfigured } from "@/lib/whatsapp/client";

const log = createLogger("api/whatsapp/media");

/**
 * Sirve un archivo (foto, audio, documento) que mandó un cliente.
 *
 * Meta guarda el archivo y da una URL que vence a los 5 minutos, así que no se
 * puede guardar el link: se pide el archivo por su id cada vez que se mira, y el
 * navegador lo cachea. Mismos roles que el resto de la bandeja (ver `access.ts`).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const gate = await requireRole(WHATSAPP_ROLES);
  if (!gate.success) return gate.response;

  const { mediaId } = await params;
  if (!/^\d{5,40}$/.test(mediaId)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  if (!isCloudApiConfigured()) return NextResponse.json({ error: "WhatsApp no configurado" }, { status: 503 });

  try {
    const { buffer, mimeType } = await downloadMedia(mediaId);
    // Foto, audio y video se muestran en la página; todo lo demás (PDF, planillas,
    // lo que sea) se baja, en vez de abrirse dentro de nuestro origen.
    const inline = /^(image|audio|video)\//.test(mimeType);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        ...(inline ? {} : { "Content-Disposition": `attachment; filename="whatsapp-${mediaId}"` }),
        "Content-Type": mimeType || "application/octet-stream",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=86400",
        // Un archivo de un cliente nunca debe ejecutarse como página dentro de nuestro origen.
        "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof WhatsAppApiError && (error.httpStatus === 404 || error.code === 100)) {
      return NextResponse.json({ error: "El archivo ya no está disponible en WhatsApp" }, { status: 404 });
    }
    log.error({ err: error }, "Error downloading WhatsApp media");
    return NextResponse.json({ error: "No se pudo bajar el archivo" }, { status: 502 });
  }
}
