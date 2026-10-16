import { prisma } from "@/lib/prisma";
import { esDemo } from "@/lib/demo-context";
import { transporter, FROM, isSmtpConfigured } from "@/lib/mailer";
import { escapeHtml } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("agents/notify");

/**
 * Aviso a los SUPERADMIN: campanita y mail. Va solo a ellos y no a todos los
 * admins (como `notifyAdmins`) porque son los únicos que pueden aprobar o
 * reconfigurar un agente: un aviso que el que lo recibe no puede resolver es
 * ruido.
 *
 * Sale desde la casilla general del CRM, no desde la de los agentes: es un
 * aviso interno, no un mail a un cliente.
 */
export async function notifySuperadmins(payload: {
  type: string;
  title: string;
  message: string;
  link: string;
  /** Líneas extra para el cuerpo del mail (por ejemplo, la lista de pendientes). */
  detail?: string[];
}): Promise<void> {
  if (esDemo()) return;
  try {
    const admins = await prisma.user.findMany({
      where: { role: "SUPERADMIN", deletedAt: null },
      select: { id: true, email: true },
    });
    if (admins.length === 0) return;

    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        link: payload.link,
      })),
    });

    // La base de desarrollo es una copia con los usuarios reales: probar una
    // ronda en local no tiene que llenarle la casilla al equipo.
    if (!isSmtpConfigured() || process.env.NODE_ENV !== "production") return;
    const origin = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
    const lista = payload.detail?.length
      ? `<ul style="padding-left:18px;margin:0 0 16px 0">${payload.detail.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>`
      : "";
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827">
      <p style="margin:0 0 12px 0">${escapeHtml(payload.message)}</p>${lista}
      <p style="margin:0"><a href="${escapeHtml(origin + payload.link)}" style="display:inline-block;background:#111827;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir en el CRM</a></p>
    </div>`;
    await Promise.all(
      admins
        .filter((a) => a.email)
        .map((a) =>
          transporter.sendMail({ from: FROM("Agentes del CRM"), to: a.email!, subject: payload.title, html })
        )
    );
  } catch (err) {
    log.error({ err }, "No se pudo avisar a los SUPERADMIN");
  }
}
