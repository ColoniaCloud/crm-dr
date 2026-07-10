import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/mail-crypto";

function getSmtpConfig() {
  const host = process.env.MAIL_SMTP_HOST;
  const port = Number(process.env.MAIL_SMTP_PORT || "465");
  const secure = process.env.MAIL_SMTP_SECURE
    ? process.env.MAIL_SMTP_SECURE === "true"
    : port === 465;

  if (!host) {
    throw new Error("MAIL_SMTP_HOST no está configurado");
  }
  return { host, port, secure };
}

export async function isUserMailConfigured(userId: string): Promise<boolean> {
  const account = await prisma.mailAccount.findUnique({
    where: { userId },
    select: { enabled: true },
  });
  return Boolean(account?.enabled);
}

export async function sendUserMail(params: {
  userId: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  cc?: string;
  inReplyTo?: string;
}): Promise<{ messageId: string; mailAddress: string }> {
  const backupAddress = process.env.MAIL_BACKUP_ADDRESS;
  if (!backupAddress) {
    throw new Error("MAIL_BACKUP_ADDRESS no está configurada — envío bloqueado por política de auditoría");
  }

  const account = await prisma.mailAccount.findUnique({
    where: { userId: params.userId },
  });
  if (!account || !account.enabled) {
    throw new Error("El usuario no tiene una casilla de correo configurada o está deshabilitada");
  }

  const password = decrypt(account.encryptedPassword);
  const { host, port, secure } = getSmtpConfig();

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: account.mailAddress, pass: password },
  });

  const info = await transporter.sendMail({
    from: account.mailAddress,
    to: params.to,
    cc: params.cc,
    bcc: backupAddress,
    subject: params.subject,
    html: params.html,
    text: params.text,
    inReplyTo: params.inReplyTo,
    references: params.inReplyTo,
  });

  return { messageId: info.messageId, mailAddress: account.mailAddress };
}
