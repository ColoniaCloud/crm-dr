import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { prisma } from "@/lib/prisma";
import { esDemo } from "@/lib/demo-context";
import { escapeHtml } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("agents/mail");

/**
 * Envío de los mails que manda un agente a un cliente.
 *
 * ─── Por qué no pasa por `lib/mailer.ts` ───────────────────────────────────
 *
 * Los agentes escriben desde `gestion@kristallfilm.com` y el resto del CRM desde
 * `noresponder@`. El SMTP de Hostinger no deja mandar con un remitente distinto
 * a la cuenta que se autentica, así que hace falta otra cuenta: AGENTS_SMTP_USER
 * y AGENTS_SMTP_PASS, sobre el mismo SMTP_HOST.
 *
 * ─── La dirección del cliente se resuelve acá ──────────────────────────────
 *
 * La IA nunca ve emails ni teléfonos (decisión 4 de AGENTES.md). Lo que viaja
 * por la bitácora es el `contactId`; el destinatario se busca recién en el
 * momento de mandar.
 *
 * ─── Desarrollo ────────────────────────────────────────────────────────────
 *
 * La base de desarrollo es una copia con clientes reales. Fuera de producción
 * nada sale a la dirección real: con AGENTS_MAIL_REDIRECT_TO va todo a esa
 * casilla, y sin ella el envío se simula. En el portal de demostración se
 * simula siempre.
 */

export type AgentMailResult = { simulated: boolean; messageId: string | null };

export class AgentMailError extends Error {}

function transport(): Mail {
  const host = process.env.SMTP_HOST;
  const user = process.env.AGENTS_SMTP_USER;
  const pass = process.env.AGENTS_SMTP_PASS;
  if (!host || !user || !pass) {
    throw new AgentMailError(
      "Falta configurar la casilla de los agentes (AGENTS_SMTP_USER / AGENTS_SMTP_PASS)."
    );
  }
  const port = Number(process.env.SMTP_PORT || "465");
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

export function agentMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.AGENTS_SMTP_USER && process.env.AGENTS_SMTP_PASS);
}

/** Cómo va a salir un envío hoy, para mostrarlo en el panel. */
export function agentMailMode(): "real" | "redirect" | "simulated" | "unconfigured" {
  if (esDemo()) return "simulated";
  if (process.env.AGENTS_MAIL_REDIRECT_TO) return "redirect";
  if (process.env.NODE_ENV !== "production") return "simulated";
  return agentMailConfigured() ? "real" : "unconfigured";
}

function toHtml(text: string): string {
  const parrafos = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0f172a">$1</a>')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111827;max-width:600px">${parrafos}</div>`;
}

export async function sendAgentMail(params: {
  contactId: string;
  subject: string;
  body: string;
  replyTo: string;
}): Promise<AgentMailResult> {
  const contacto = await prisma.contact.findUnique({
    where: { id: params.contactId },
    select: { email: true },
  });
  const destino = contacto?.email?.trim();
  if (!destino) throw new AgentMailError("El cliente no tiene email cargado.");

  const modo = agentMailMode();
  if (modo === "simulated") {
    log.info({ contactId: params.contactId }, "Envío de agente simulado: no sale ningún mail");
    return { simulated: true, messageId: null };
  }

  const redirect = process.env.AGENTS_MAIL_REDIRECT_TO;
  const from = `Kristall Film – Administración <${process.env.AGENTS_SMTP_USER}>`;
  const info = await transport().sendMail({
    from,
    to: redirect || destino,
    replyTo: params.replyTo,
    bcc: redirect ? undefined : process.env.MAIL_BACKUP_ADDRESS || undefined,
    subject: redirect ? `[PRUEBA] ${params.subject}` : params.subject,
    text: params.body,
    html: toHtml(params.body),
  });
  return { simulated: Boolean(redirect), messageId: info.messageId ?? null };
}
