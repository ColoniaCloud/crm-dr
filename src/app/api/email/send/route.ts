import { NextResponse } from "next/server";
import { isSmtpConfigured, transporter } from "@/lib/mailer";
import { requireRole } from "@/lib/api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/email/send");

export async function POST(request: Request) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;
  const { session } = gate;

  // Throttle to curb spam / phishing abuse from a compromised account.
  const rl = rateLimit(`email-send:${session.user.id}`, 20, 10 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Demasiados emails enviados. Esperá ${rl.retryAfter}s antes de reintentar.` },
      { status: 429 }
    );
  }

  try {
    const { to, subject, body, fromName } = await request.json();

    if (!to || !subject || !body) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    if (!isSmtpConfigured()) {
      return NextResponse.json({ error: "SMTP no configurado" }, { status: 500 });
    }

    const displayName = fromName || "DR Polarizados";
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;

    const info = await transporter.sendMail({
      from: `${displayName} <${fromEmail}>`,
      to,
      subject,
      html: body.replace(/\n/g, "<br/>"),
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "SEND_EMAIL",
      entityType: "EMAIL",
      description: `Envió email a ${to}: "${subject}"`,
    });

    return NextResponse.json({ id: info.messageId });
  } catch (err) {
    log.error({ err: err }, "Error sending email");
    return NextResponse.json({ error: "Error al enviar email" }, { status: 500 });
  }
}
