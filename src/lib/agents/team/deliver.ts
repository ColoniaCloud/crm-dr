import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { esDemo } from "@/lib/demo-context";
import { transporter, FROM, isSmtpConfigured } from "@/lib/mailer";
import { escapeHtml } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
import type { TeamConfig } from "@/lib/agents/team/config";

const log = createLogger("agents/team-deliver");

/** Firma de todo lo que el Supervisor le manda a un empleado: no se hace pasar por nadie. */
export const FIRMA = "Asistente de seguimiento";

/**
 * Le manda un mensaje a un empleado (campanita y/o mail, según la config) y lo
 * deja en la bitácora del agente como acción enviada.
 *
 * `dedupeKey` evita mandar dos veces lo mismo (el resumen del día, por ejemplo):
 * si ya existe, no manda nada y devuelve false.
 *
 * Fuera de producción el mail no sale (la base de desarrollo tiene los usuarios
 * reales); la campanita sí, porque no sale del CRM.
 */
export async function deliverToUser(params: {
  agentId: string;
  runId?: string;
  user: { id: string; name: string; email: string };
  type: "REMINDER" | "GUIDED_TASK" | "MESSAGE";
  subject: string;
  body: string;
  link: string;
  channels: TeamConfig["channels"];
  dedupeKey?: string;
  requestedById?: string;
}): Promise<boolean> {
  const mailReal = params.channels.email && !esDemo() && process.env.NODE_ENV === "production" && isSmtpConfigured();
  let accionId: string;
  try {
    const a = await prisma.agentAction.create({
      data: {
        agentId: params.agentId,
        runId: params.runId ?? null,
        origin: params.requestedById ? "CHAT" : "RUN",
        type: params.type,
        status: "SENT",
        targetUserId: params.user.id,
        contactName: params.user.name,
        subject: params.subject,
        body: params.body,
        dedupeKey: params.dedupeKey ?? null,
        simulated: params.channels.email && !mailReal,
        requestedById: params.requestedById ?? null,
        sentAt: new Date(),
      },
      select: { id: true },
    });
    accionId = a.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }

  try {
    if (params.channels.notification) {
      await prisma.notification.create({
        data: {
          userId: params.user.id,
          type: `AGENT_${params.type}`,
          title: params.subject,
          message: params.body.length > 500 ? `${params.body.slice(0, 497)}…` : params.body,
          link: params.link,
        },
      });
    }
    if (mailReal) {
      const origin = (process.env.NEXTAUTH_URL || "https://crm.kristallfilm.com").replace(/\/$/, "");
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111827;max-width:600px">
        ${escapeHtml(params.body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px 0">${p.replace(/\n/g, "<br>")}</p>`).join("")}
        <p style="margin:0 0 14px 0"><a href="${origin}${params.link}" style="display:inline-block;background:#111827;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir en el CRM</a></p>
        <p style="margin:0;color:#6b7280;font-size:12px">${FIRMA} — mensaje automático del CRM.</p>
      </div>`;
      await transporter.sendMail({ from: FROM(FIRMA), to: params.user.email, subject: params.subject, html, text: params.body });
    }
    return true;
  } catch (err) {
    log.error({ err, userId: params.user.id }, "No se pudo entregar el mensaje del Supervisor");
    await prisma.agentAction.update({
      where: { id: accionId },
      data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) },
    });
    return false;
  }
}
