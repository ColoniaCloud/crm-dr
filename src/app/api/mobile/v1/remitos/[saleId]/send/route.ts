import { NextResponse } from "next/server";
import { z } from "zod";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { validateBody } from "@/lib/api-validation";
import { transporter } from "@/lib/mailer";
import { buildRemitoPdfBuffer } from "@/lib/remito-pdf-server";
import { escapeHtml, logOperatorAction } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mobile/v1/remitos/[saleId]/send");

const sendSchema = z.object({ email: z.string().email().optional() });

export function OPTIONS() {
  return mobileCorsPreflight();
}

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
      include: {
        contact: true,
        items: { include: { product: { select: { name: true, category: true } } } },
        remito: true,
      },
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

    if (!process.env.SMTP_USER) {
      return withMobileCors(NextResponse.json({ error: "SMTP no configurado" }, { status: 500 }));
    }

    // Throttle accidental double-taps on "Enviar" — 60s per sale, same cooldown quotes use.
    const rl = rateLimit(`mobile-remito-send:${saleId}`, 1, 60_000);
    if (!rl.allowed) {
      return withMobileCors(
        NextResponse.json({ error: `Este remito ya se envió hace poco. Esperá ${rl.retryAfter}s antes de reenviar.` }, { status: 429 })
      );
    }

    const pdfBuffer = buildRemitoPdfBuffer({
      number: sale.remito.number,
      issuedAt: sale.remito.issuedAt.toISOString(),
      notes: sale.remito.notes,
      facturaInfo: sale.remito.facturaInfo,
      sale: {
        number: sale.number,
        requiresFactura: sale.requiresFactura,
        contact: sale.contact,
        items: sale.items,
      },
    });

    const contactName = `${sale.contact.firstName ?? ""} ${sale.contact.lastName ?? ""}`.trim();
    const displayName = contactName || sale.contact.company || "estimado cliente";
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;

    const docLabel = sale.requiresFactura ? "el remito y los datos de tu factura" : "tu remito";
    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;">
  <p style="color:#333;font-size:15px;line-height:1.6;">
    Hola, <strong>${escapeHtml(displayName)}</strong>.<br/>
    Te enviamos ${docLabel} de la venta #${sale.number}, adjunto en PDF.
  </p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5;" />
  <p style="color:#666;font-size:13px;line-height:1.5;">
    <strong>Dr Polarizados</strong> - Distribuidor oficial<br/>
    <a href="https://www.drpolarizados.com" style="color:#2563eb;">www.drpolarizados.com</a><br/>
    <a href="mailto:ventas@drpolarizados.com" style="color:#2563eb;">ventas@drpolarizados.com</a>
  </p>
</div>`;

    const mailOptions: nodemailer.SendMailOptions = {
      from: `Dr Polarizados <${fromEmail}>`,
      to: email,
      subject: `Remito #${sale.remito.number} - Venta #${sale.number} - Dr Polarizados`,
      html,
      attachments: [{ filename: `remito-${sale.remito.number}.pdf`, content: pdfBuffer }],
    };

    await transporter.sendMail(mailOptions);

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
