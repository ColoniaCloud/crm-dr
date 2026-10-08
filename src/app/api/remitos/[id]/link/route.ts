import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { ensureRemitoPublicToken, remitoPublicUrl } from "@/lib/remito-document";

const log = createLogger("api/remitos/link");

/**
 * El link público del remito (`/r/<token>`), generándolo la primera vez.
 *
 * POST y no GET porque puede escribir (crear el token). El token no se crea al
 * crear la venta a propósito: así un remito que nunca se manda nunca tiene una
 * URL pública dando vueltas.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;

  const { id } = await params;
  try {
    const token = await ensureRemitoPublicToken(prisma, id);
    return NextResponse.json({ url: remitoPublicUrl(token) });
  } catch (error) {
    if (error instanceof Error && error.message === "Remito no encontrado") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    log.error({ err: error, remitoId: id }, "Error generando el link del remito");
    return NextResponse.json({ error: "No se pudo generar el link" }, { status: 500 });
  }
}
