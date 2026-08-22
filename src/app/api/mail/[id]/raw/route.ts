import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { readStoredFile, contentDispositionFilename } from "@/lib/mail-attachments";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mail/[id]/raw");

/**
 * Descarga el mensaje MIME original (.eml) tal como llegó por IMAP.
 *
 * Restringido a SUPERADMIN: el .eml trae las cabeceras completas (rutas de
 * entrega, IPs, resultados de SPF/DKIM) y el HTML sin sanitizar. Sirve para
 * peritar un mail dudoso o reprocesarlo, no para la operación diaria.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id } = await params;

    const email = await prisma.email.findFirst({
      where: { id, userId: session.user.id },
      select: { rawStorageKey: true, subject: true },
    });

    if (!email) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (!email.rawStorageKey) {
      return NextResponse.json(
        { error: "Este mensaje no tiene copia del original guardada" },
        { status: 404 }
      );
    }

    const data = await readStoredFile(email.rawStorageKey);
    const name = `${(email.subject || "mensaje").slice(0, 60).replace(/[/\\?%*:|"<>]/g, "-")}.eml`;

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "message/rfc822",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `attachment; ${contentDispositionFilename(name)}`,
        "Content-Length": String(data.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    log.error({ err: error }, "Error serving raw message");
    return NextResponse.json({ error: "Error al descargar el original" }, { status: 500 });
  }
}
