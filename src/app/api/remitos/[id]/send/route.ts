import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { isSmtpConfigured } from "@/lib/mailer";
import { rateLimit } from "@/lib/rate-limit";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
import { sendRemitoEmail } from "@/lib/remito-share";

const log = createLogger("api/remitos/send");

const bodySchema = z.object({ email: z.string().email().max(191).optional() });

/**
 * Manda el remito por mail desde la pantalla del remito. Sin firmar va con el
 * botón para firmarlo online; firmado, la copia firmada. Sin `email`, al del
 * contacto.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const json = await request.json().catch(() => ({}));
  const parsed = validateBody(bodySchema, json);
  if (!parsed.success) return parsed.response;

  const { id } = await params;
  try {
    const remito = await prisma.remito.findUnique({
      where: { id },
      select: { number: true, saleId: true, sale: { select: { number: true, contact: { select: { email: true } } } } },
    });
    if (!remito) return NextResponse.json({ error: "Remito no encontrado" }, { status: 404 });

    const to = parsed.data.email || remito.sale.contact.email;
    if (!to) return NextResponse.json({ error: "El cliente no tiene email cargado: escribí uno" }, { status: 400 });
    if (!isSmtpConfigured()) return NextResponse.json({ error: "El correo no está configurado" }, { status: 500 });

    // Un doble clic no manda dos mails. Mismo enfriamiento que el envío del POS.
    const rl = rateLimit(`remito-send:${id}`, 1, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: `Este remito se mandó hace un momento. Esperá ${rl.retryAfter}s para reenviarlo.` }, { status: 429 });
    }

    await sendRemitoEmail(prisma, id, to);

    await logOperatorAction({
      userId: session.user.id,
      action: "SEND_REMITO",
      entityType: "REMITO",
      entityId: id,
      description: `Envió el remito #${remito.number} (venta #${remito.sale.number}) a ${to}`,
      link: `/sales/${remito.saleId}`,
    });
    return NextResponse.json({ ok: true, sentTo: to });
  } catch (error) {
    log.error({ err: error, remitoId: id }, "Error enviando el remito");
    return NextResponse.json({ error: "No se pudo enviar el mail" }, { status: 500 });
  }
}
