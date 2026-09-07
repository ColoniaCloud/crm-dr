import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { BRAND } from "@/lib/brand";

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP incompleto: faltan SMTP_HOST, SMTP_USER o SMTP_PASS");
  }

  const port = Number(process.env.SMTP_PORT || "465");
  if (Number.isNaN(port) || port <= 0) {
    throw new Error("SMTP_PORT inválido");
  }

  // By default: 465 uses SSL/TLS (secure=true), 587/25 use STARTTLS (secure=false).
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;

  return {
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  };
}

let cachedTransporter: Mail | null = null;

function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport(getSmtpConfig());
  }
  return cachedTransporter;
}

export const transporter = {
  sendMail: (...args: Parameters<Mail["sendMail"]>) => getTransporter().sendMail(...args),
  verify: (...args: Parameters<Mail["verify"]>) => getTransporter().verify(...args),
};

export const isSmtpConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

/**
 * Remitente completo para `sendMail`. El nombre visible se puede sobreescribir
 * (los mails al cliente lo hacían por su cuenta antes de que esto lo aceptara),
 * pero la dirección siempre sale de la configuración del servidor.
 */
export const FROM = (displayName: string = BRAND.name) =>
  `${displayName} <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
