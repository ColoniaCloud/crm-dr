import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { escapeHtml, logOperatorAction } from "@/lib/notifications";
import { transporter } from "@/lib/mailer";
import nodemailer from "nodemailer";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/quotes/[id]/send");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      contact: true,
      items: { include: { product: true } },
    },
  });

  if (!quote) {
    return NextResponse.json({ error: "Presupuesto no encontrado" }, { status: 404 });
  }

  // Rate limit: prevent resending within 60 seconds
  if (quote.sentAt && Date.now() - new Date(quote.sentAt).getTime() < 60_000) {
    return NextResponse.json({ error: "El presupuesto ya fue enviado recientemente. Espera un momento antes de reenviar." }, { status: 429 });
  }

  const email = quote.contact.email;
  if (!email) {
    return NextResponse.json({ error: "El contacto no tiene email registrado" }, { status: 400 });
  }

  if (!process.env.SMTP_USER) {
    return NextResponse.json({ error: "SMTP no configurado" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const pdfBase64: string | undefined = body.pdfBase64;

    const contactName = `${quote.contact.firstName ?? ""} ${quote.contact.lastName ?? ""}`.trim();
    const displayName = contactName || quote.contact.company || "estimado cliente";

    const whatsappPhone = process.env.WHATSAPP_DEFAULT_NUMBER ?? null;
    if (!whatsappPhone) {
      log.warn("WHATSAPP_DEFAULT_NUMBER no definida, se omite enlace de WhatsApp");
    }
    const whatsappLink = whatsappPhone
      ? `https://api.whatsapp.com/send/?phone=${whatsappPhone}&text=Hola%2C+me+gustar%C3%ADa+recibir+asesoramiento+sobre+mi+presupuesto.&type=phone_number&app_absent=0`
      : null;
    const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "https://crm.drpolarizados.com";

    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;">
  <div style="text-align:center;margin-bottom:20px;">
    <img src="${baseUrl}/logomail.png" alt="Dr Polarizados" style="max-width:180px;height:auto;" />
  </div>
  <p style="color:#333;font-size:15px;line-height:1.6;">
    Hola, <strong>${escapeHtml(displayName)}</strong>.<br/>
    Te enviamos el presupuesto de nuestros artículos para que lo analices, en el PDF adjunto detallamos el costo, el descuento y los artículos solicitados/ofrecidos.
  </p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5;" />
  <p style="color:#666;font-size:13px;line-height:1.5;">
    <strong>Dr Polarizados</strong> - Distribuidor oficial<br/>
    <a href="https://www.drpolarizados.com" style="color:#2563eb;">www.drpolarizados.com</a><br/>
    <a href="mailto:ventas@drpolarizados.com" style="color:#2563eb;">ventas@drpolarizados.com</a>
  </p>
  ${whatsappLink ? `<div style="margin-top:16px;">
    <a href="${whatsappLink}" style="display:inline-block;padding:10px 20px;background:#25D366;color:#fff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold;">
      💬 Chat por WhatsApp
    </a>
  </div>` : ""}
</div>`;

    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;

    const mailOptions: nodemailer.SendMailOptions = {
      from: `Dr Polarizados <${fromEmail}>`,  // nombre específico para mails al cliente
      to: email,
      subject: `Presupuesto #${quote.number} - Dr Polarizados`,
      html,
    };

    if (pdfBase64) {
      mailOptions.attachments = [
        {
          filename: `presupuesto-${quote.number}.pdf`,
          content: Buffer.from(pdfBase64, "base64"),
        },
      ];
    }

    await transporter.sendMail(mailOptions);

    // Update quote: mark as SENT and set sentAt
    await prisma.quote.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });

    // Auto-create timeline activity
    try {
      await prisma.leadActivity.create({
        data: {
          contactId: quote.contactId,
          userId: session.user.id,
          type: "QUOTE_SENT",
          title: "Presupuesto enviado",
          description: `Presupuesto #${quote.number} enviado por email`,
        },
      });
    } catch { /* non-critical */ }

    await logOperatorAction({ userId: session.user.id, action: "SEND_QUOTE", entityType: "QUOTE", entityId: id, description: `Envió presupuesto #${quote.number} a ${email}`, link: `/quotes/${id}` });
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err: err }, "Error sending quote email");
    return NextResponse.json({ error: "Error al enviar email" }, { status: 500 });
  }
}
