import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateBody } from "@/lib/api-validation";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { createLogger } from "@/lib/logger";
import { loadRemitoByToken } from "@/lib/remito-document";
import { FirmaRechazada, afterRemitoSigned, signRemito } from "@/lib/remito-sign";

const log = createLogger("api/public/remitos/sign");

const bodySchema = z.object({
  /** Data URL PNG. El tamaño y el formato los valida signRemito. */
  signature: z.string().min(1),
  name: z.string().min(1).max(200),
  dni: z.string().max(40).optional().nullable(),
  /** A dónde mandar la copia firmada, si el contacto no tiene email cargado. */
  email: z.string().email().max(191).optional().nullable(),
});

/**
 * El cliente firma su remito desde `/r/<token>`, sin cuenta.
 *
 * El token es la única credencial (192 bits, no adivinable). Lo que puede hacer
 * quien lo tiene es justamente firmar ese remito, una vez. Rate limit por IP
 * y por token para que no sirva como oráculo ni para martillar la base.
 *
 * Mismo origen que la página (`/r/` vive en el CRM): sin CORS.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientIp(request);

  const porIp = rateLimit(`remito-sign-ip:${ip}`, 10, 10 * 60_000);
  const porToken = rateLimit(`remito-sign-token:${token}`, 5, 10 * 60_000);
  if (!porIp.allowed || !porToken.allowed) {
    return NextResponse.json({ error: "Demasiados intentos. Probá de nuevo en unos minutos." }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = validateBody(bodySchema, json);
  if (!parsed.success) return parsed.response;

  try {
    const remito = await loadRemitoByToken(prisma, token);
    if (!remito) return NextResponse.json({ error: "Remito no encontrado" }, { status: 404 });

    const result = await signRemito({
      remitoId: remito.id,
      via: "ONLINE",
      actorUserId: null,
      name: parsed.data.name,
      dni: parsed.data.dni,
      image: parsed.data.signature,
      ip,
      userAgent: request.headers.get("user-agent"),
    });

    // El email cargado en el contacto manda; el que escribió quien firma es
    // para cuando el contacto no tiene uno. No se guarda en la ficha: un
    // formulario público no edita datos del CRM.
    const emailTo = result.contactEmail || parsed.data.email || null;
    const { sentTo } = await afterRemitoSigned(result, { emailTo });

    log.info({ remitoId: remito.id, saleId: result.saleId, confirmada: result.confirmada }, "Remito firmado online");
    return NextResponse.json({ ok: true, signedAt: result.signature.signedAt, emailSent: Boolean(sentTo) });
  } catch (error) {
    if (error instanceof FirmaRechazada) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    log.error({ err: error }, "Error en la firma online del remito");
    return NextResponse.json({ error: "No pudimos registrar la firma. Probá de nuevo." }, { status: 500 });
  }
}
