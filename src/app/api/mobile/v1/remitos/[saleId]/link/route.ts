import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { createLogger } from "@/lib/logger";
import { buildRemitoShareInfo } from "@/lib/remito-share";

const log = createLogger("api/mobile/v1/remitos/[saleId]/link");

export function OPTIONS() {
  return mobileCorsPreflight();
}

/**
 * El link para que el cliente firme después ("Entregar después" en el POS), con
 * el WhatsApp armado. Sin el QR: en el POS el link se comparte, no se escanea.
 */
export async function POST(request: Request, { params }: { params: Promise<{ saleId: string }> }) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  const { saleId } = await params;
  try {
    const remito = await prisma.remito.findUnique({ where: { saleId }, select: { id: true } });
    if (!remito) return withMobileCors(NextResponse.json({ error: "Esta venta no tiene remito" }, { status: 404 }));
    const { url, whatsappUrl, message, signed } = await buildRemitoShareInfo(prisma, remito.id);
    return withMobileCors(NextResponse.json({ url, whatsappUrl, message, signed }));
  } catch (error) {
    log.error({ err: error, saleId }, "Error generando el link del remito");
    return withMobileCors(NextResponse.json({ error: "No se pudo generar el link" }, { status: 500 }));
  }
}
