import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { loadRemitoById, remitoPublicUrl } from "@/lib/remito-document";
import { buildRemitoPdfBuffer, remitoPdfFilename } from "@/lib/remito-pdf-server";

const log = createLogger("api/remitos/pdf");

/**
 * El PDF del remito para descargar desde el CRM. Firmado sale del snapshot,
 * con la firma al pie; sin firmar, con los datos de ahora y —si ya se generó
 * el link— la URL para firmarlo online.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;

  const { id } = await params;
  try {
    const r = await loadRemitoById(prisma, id);
    if (!r) return NextResponse.json({ error: "Remito no encontrado" }, { status: 404 });

    const pdf = buildRemitoPdfBuffer(r.document, {
      signature: r.signature,
      signUrl: !r.signature && r.publicToken ? remitoPublicUrl(r.publicToken) : null,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${remitoPdfFilename(r.document, !!r.signature)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    log.error({ err: error, remitoId: id }, "Error generando el PDF del remito");
    return NextResponse.json({ error: "No se pudo generar el PDF" }, { status: 500 });
  }
}
