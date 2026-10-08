import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { validateBody } from "@/lib/api-validation";
import { clientIp } from "@/lib/request-ip";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
import { FirmaRechazada, signRemitoInPerson } from "@/lib/remito-sign";

const log = createLogger("api/mobile/v1/remitos/[saleId]/sign");

const bodySchema = z.object({
  signature: z.string().min(1),
  name: z.string().min(1).max(200),
  dni: z.string().max(40).optional().nullable(),
  email: z.string().email().max(191).optional().nullable(),
  /** Guardar `email` en la ficha del cliente (solo si no tenía uno). */
  saveEmail: z.boolean().optional(),
});

export function OPTIONS() {
  return mobileCorsPreflight();
}

/**
 * El cliente firma el remito en el teléfono del vendedor, en ruta.
 *
 * Cualquier usuario del POS puede, OPERATOR incluido: son los que venden y
 * entregan. La firma desde el CRM (/api/remitos/[id]/sign) sigue siendo ADMIN+
 * porque ahí la registra alguien que no vio la entrega.
 */
export async function POST(request: Request, { params }: { params: Promise<{ saleId: string }> }) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  const json = await request.json().catch(() => null);
  const parsed = validateBody(bodySchema, json);
  if (!parsed.success) return withMobileCors(parsed.response);

  const { saleId } = await params;
  try {
    const remito = await prisma.remito.findUnique({ where: { saleId }, select: { id: true } });
    if (!remito) return withMobileCors(NextResponse.json({ error: "Esta venta no tiene remito" }, { status: 404 }));

    const { result, sentTo, emailSaved } = await signRemitoInPerson({
      remitoId: remito.id,
      actorUserId: gate.user.sub,
      name: parsed.data.name,
      dni: parsed.data.dni,
      image: parsed.data.signature,
      email: parsed.data.email,
      saveEmail: parsed.data.saveEmail,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    await logOperatorAction({
      userId: gate.user.sub,
      action: "SIGN_REMITO",
      entityType: "REMITO",
      entityId: remito.id,
      description:
        `El cliente firmó en el POS el remito #${result.remitoNumber} (venta #${result.saleNumber})` +
        (sentTo ? `; copia a ${sentTo}` : ""),
      link: `/sales/${result.saleId}`,
    });
    return withMobileCors(NextResponse.json({ ok: true, sentTo, emailSaved, signedAt: result.signature.signedAt }));
  } catch (error) {
    if (error instanceof FirmaRechazada) {
      return withMobileCors(NextResponse.json({ error: error.message }, { status: error.status }));
    }
    log.error({ err: error, saleId }, "Error en la firma desde el POS");
    return withMobileCors(NextResponse.json({ error: "No se pudo registrar la firma" }, { status: 500 }));
  }
}
