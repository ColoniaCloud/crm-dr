import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { BRAND } from "@/lib/brand";
import { esDemo } from "@/lib/demo-context";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/mailer");

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

/**
 * El único lugar por donde sale correo del CRM.
 *
 * ─── La guardia del portal de demostración ─────────────────────────────────
 *
 * Un prospecto jugando con la demo puede pasar una orden a TERMINADA, y eso
 * genera la garantía y **manda el mail al cliente final** — a la dirección que
 * ese prospecto haya tipeado, con la marca Kristall. Alguien recibiría una
 * garantía de un trabajo que no existe.
 *
 * La guardia va acá y no en cada lugar que manda correo. Son 16 llamadas
 * repartidas por todo el CRM: guardias repartidas son guardias que alguien se
 * va a olvidar el día que agregue la número 17, y ese olvido no se ve —
 * simplemente sale un mail que no tenía que salir.
 *
 * Se devuelve una respuesta con forma de éxito en vez de tirar: quien llamó
 * hizo algo legítimo y su flujo tiene que seguir. El mail es un efecto
 * secundario, y en la demo el efecto secundario correcto es ninguno.
 */
export const transporter = {
  sendMail: (...args: Parameters<Mail["sendMail"]>) => {
    if (esDemo()) {
      const destino = (args[0] as Mail.Options)?.to;
      log.info({ to: destino }, "Sesión de demostración: el correo NO se envía");
      return Promise.resolve({
        accepted: [],
        rejected: [],
        messageId: "demo-no-enviado",
      } as unknown as ReturnType<Mail["sendMail"]>);
    }
    return getTransporter().sendMail(...args);
  },
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
