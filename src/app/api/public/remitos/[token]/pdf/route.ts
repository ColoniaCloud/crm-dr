import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { createLogger } from "@/lib/logger";
import { loadRemitoByToken } from "@/lib/remito-document";
import { buildRemitoPdfBuffer, remitoPdfFilename } from "@/lib/remito-pdf-server";

const log = createLogger("api/public/remitos/pdf");

/** El PDF del remito para quien tiene el link. Firmado, sale del snapshot. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rl = rateLimit(`remito-pdf-ip:${clientIp(request)}`, 20, 10 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas descargas. Probá de nuevo en unos minutos." }, { status: 429 });
  }

  try {
    const r = await loadRemitoByToken(prisma, token);
    if (!r) return NextResponse.json({ error: "Remito no encontrado" }, { status: 404 });

    const pdf = buildRemitoPdfBuffer(r.document, { signature: r.signature });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${remitoPdfFilename(r.document, !!r.signature)}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    log.error({ err: error }, "Error generando el PDF público del remito");
    return NextResponse.json({ error: "No se pudo generar el PDF" }, { status: 500 });
  }
}
