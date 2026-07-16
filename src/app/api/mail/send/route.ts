import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { rateLimit } from "@/lib/rate-limit";
import { isUserMailConfigured, sendUserMail } from "@/lib/user-mailer";
import { logOperatorAction } from "@/lib/notifications";
import { stripHtml } from "@/lib/mail-poller";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mail/send");

// Business rule: todo email saliente del CRM lleva copia (CC, visible para el
// destinatario) a la casilla de Gmail de Carlos. Fijo a propósito — no es
// configurable ni visible desde la UI de redacción.
const ALWAYS_CC_ADDRESS = "drpolarizados.contacto@gmail.com";

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const sendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
  contactId: z.string().optional(),
  inReplyTo: z.string().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1),
        contentType: z.string().min(1),
        data: z.string().min(1),
      })
    )
    .max(MAX_ATTACHMENTS)
    .optional(),
});

export async function POST(request: Request) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;
  const { session } = gate;

  const rl = rateLimit(`mail-send:${session.user.id}`, 20, 10 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Demasiados emails enviados. Esperá ${rl.retryAfter}s antes de reintentar.` },
      { status: 429 }
    );
  }

  const json = await request.json().catch(() => null);
  const validation = validateBody(sendSchema, json);
  if (!validation.success) return validation.response;
  const { to, subject, html, contactId, inReplyTo, attachments } = validation.data;

  if (!(await isUserMailConfigured(session.user.id))) {
    return NextResponse.json(
      { error: "No tenés una casilla de correo configurada. Pedile a un administrador que la configure en Configuración." },
      { status: 400 }
    );
  }

  if (attachments?.length) {
    let totalBytes = 0;
    for (const a of attachments) {
      const bytes = Math.ceil((a.data.length * 3) / 4);
      if (bytes > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({ error: `El archivo "${a.filename}" supera el máximo de 10MB` }, { status: 400 });
      }
      totalBytes += bytes;
    }
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: "El total de adjuntos supera el máximo de 20MB" }, { status: 400 });
    }
  }

  const bodyText = stripHtml(html);
  let status: "SENT" | "FAILED" = "SENT";
  let messageId = `failed-${Date.now()}-${session.user.id}@local`;
  let mailAddress = "";
  let errorMessage: string | null = null;

  try {
    const result = await sendUserMail({
      userId: session.user.id,
      to,
      subject,
      html,
      text: bodyText,
      cc: ALWAYS_CC_ADDRESS,
      inReplyTo,
      attachments,
    });
    messageId = result.messageId;
    mailAddress = result.mailAddress;
  } catch (err) {
    status = "FAILED";
    errorMessage = err instanceof Error ? err.message : "Error desconocido";
    log.error({ err }, "Error sending user mail");
  }

  const email = await prisma.email.create({
    data: {
      userId: session.user.id,
      contactId: contactId || null,
      direction: "OUT",
      status,
      subject,
      bodyHtml: html,
      bodyText,
      fromAddress: mailAddress,
      toAddress: to,
      ccAddress: ALWAYS_CC_ADDRESS,
      messageId,
      inReplyTo: inReplyTo || null,
      errorMessage,
      read: true,
      sentAt: new Date(),
    },
  });

  if (status === "FAILED") {
    return NextResponse.json({ error: errorMessage, email }, { status: 502 });
  }

  if (contactId) {
    await prisma.leadActivity.create({
      data: {
        contactId,
        userId: session.user.id,
        type: "EMAIL_SENT",
        title: `Email enviado: ${subject}`,
        description: `Para: ${to}`,
      },
    });
  }

  await logOperatorAction({
    userId: session.user.id,
    action: "SEND_EMAIL",
    entityType: "EMAIL",
    entityId: email.id,
    description: `Envió email a ${to}: "${subject}"`,
    link: contactId ? `/leads/${contactId}` : undefined,
  });

  return NextResponse.json(email, { status: 201 });
}
