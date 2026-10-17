import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { agentOwners } from "@/lib/agents/access";
import { logOperatorAction } from "@/lib/notifications";
import { esDemo } from "@/lib/demo-context";
import { transporter, FROM, isSmtpConfigured } from "@/lib/mailer";
import { escapeHtml } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("agents/notify");

type Notice = {
  type: string;
  title: string;
  message: string;
  link: string;
  /** Líneas extra para el cuerpo del mail (por ejemplo, la lista de pendientes). */
  detail?: string[];
};

/**
 * Aviso sobre un agente: a sus dueños si los tiene (decisión del Supervisor del
 * equipo: nadie más se entera de lo que hace), si no a los SUPERADMIN.
 */
export async function notifyAgentOwners(agentId: string, payload: Notice): Promise<void> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { visibleToUserIds: true } });
  const owners = agent ? agentOwners(agent) : null;
  return notifyUsers(owners ? { id: { in: owners } } : { role: "SUPERADMIN" }, payload);
}

/**
 * Aviso a los SUPERADMIN: campanita y mail. Va solo a ellos y no a todos los
 * admins (como `notifyAdmins`) porque son los únicos que pueden aprobar o
 * reconfigurar un agente: un aviso que el que lo recibe no puede resolver es
 * ruido.
 *
 * Sale desde la casilla general del CRM, no desde la de los agentes: es un
 * aviso interno, no un mail a un cliente.
 */
export async function notifySuperadmins(payload: Notice): Promise<void> {
  return notifyUsers({ role: "SUPERADMIN" }, payload);
}

async function notifyUsers(who: Prisma.UserWhereInput, payload: Notice): Promise<void> {
  if (esDemo()) return;
  try {
    const admins = await prisma.user.findMany({
      where: { ...who, deletedAt: null },
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
    log.error({ err }, "No se pudo mandar el aviso del agente");
  }
}

/**
 * `logOperatorAction` para lo que pasa en un agente. Si el agente tiene dueños
 * no se registra: la bitácora de operadores la ven ADMIN y SUPERADMIN, y ahí se
 * vería que el agente existe. Lo que hace queda en su propia bitácora
 * (ejecuciones, acciones y chat), que solo ven sus dueños.
 */
export async function logAgentAudit(params: Parameters<typeof logOperatorAction>[0]): Promise<void> {
  if (params.entityType === "Agent" && params.entityId) {
    const agent = await prisma.agent.findUnique({ where: { id: params.entityId }, select: { visibleToUserIds: true } });
    if (agent && agentOwners(agent)) return;
  }
  await logOperatorAction(params);
}
