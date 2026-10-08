import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { validateBody } from "@/lib/api-validation";
import { isSmtpConfigured } from "@/lib/mailer";
import { sendRemitoEmail } from "@/lib/remito-share";
import { logOperatorAction } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mobile/v1/remitos/[saleId]/send");

const sendSchema = z.object({ email: z.string().email().optional() });

export function OPTIONS() {
  return mobileCorsPreflight();
}

/**
 * Manda el remito por mail desde el POS. Mismo mail que desde el CRM
 * (src/lib/remito-share.ts): sin firmar, con el botón para firmarlo online;
 * firmado, la copia firmada.
 */
export async function POST(request: Request, { params }: { params: Promise<{ saleId: string }> }) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  const json = await request.json().catch(() => ({}));
  const validation = validateBody(sendSchema, json);
  if (!validation.success) return withMobileCors(validation.response);

  try {
    const { saleId } = await params;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, number: true, contact: { select: { email: true } }, remito: { select: { id: true, number: true } } },
    });

    if (!sale) {
      return withMobileCors(NextResponse.json({ error: "Venta no encontrada" }, { status: 404 }));
    }
    if (!sale.remito) {
      return withMobileCors(NextResponse.json({ error: "Esta venta no tiene remito" }, { status: 404 }));
    }

    const email = validation.data.email || sale.contact.email;
    if (!email) {
      return withMobileCors(
        NextResponse.json({ error: "El cliente no tiene email cargado — indicá uno para enviar" }, { status: 400 })
      );
    }

    if (!isSmtpConfigured()) {
      return withMobileCors(NextResponse.json({ error: "SMTP no configurado" }, { status: 500 }));
    }

    // Throttle accidental double-taps on "Enviar" — 60s per sale, same cooldown quotes use.
    const rl = rateLimit(`mobile-remito-send:${saleId}`, 1, 60_000);
    if (!rl.allowed) {
      return withMobileCors(
        NextResponse.json({ error: `Este remito ya se envió hace poco. Esperá ${rl.retryAfter}s antes de reenviar.` }, { status: 429 })
      );
    }

    await sendRemitoEmail(prisma, sale.remito.id, email);

    await logOperatorAction({
      userId: gate.user.sub,
      action: "SEND_REMITO",
      entityType: "SALE",
      entityId: sale.id,
      description: `Envió el remito #${sale.remito.number} (venta #${sale.number}) a ${email} (app móvil)`,
      link: `/sales/${sale.id}`,
    });

    return withMobileCors(NextResponse.json({ success: true, sentTo: email }));
  } catch (err) {
    log.error({ err }, "Error sending remito email");
    return withMobileCors(NextResponse.json({ error: "Error al enviar el email" }, { status: 500 }));
  }
}
