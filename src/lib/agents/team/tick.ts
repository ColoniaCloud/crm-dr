import type { Agent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyAgentOwners } from "@/lib/agents/notify";
import { startOfLocalDay } from "@/lib/agents/schedule";
import { readTeamConfig } from "@/lib/agents/team/config";
import { auditedUsers, userMetrics } from "@/lib/agents/team/metrics";

/**
 * Alertas en el momento del Supervisor del equipo. Las dispara el cron cada 15
 * minutos (no la ronda diaria), en horario de trabajo de lunes a viernes, y
 * cada alerta sale una sola vez por persona y por día.
 *
 *   - alguien sin ninguna actividad en el CRM hace `inactiveDays` días hábiles;
 *   - alguien con `overdueTasks` o más tareas vencidas abiertas;
 *   - mails de clientes sin responder hace más de `unansweredMailHours`.
 *
 * Todo con código: no gasta IA.
 */

const OFFSET_MS = -3 * 3_600_000;

function horaLocal(now: Date): { hora: number; dow: number } {
  const local = new Date(now.getTime() + OFFSET_MS);
  return { hora: local.getUTCHours(), dow: ((local.getUTCDay() + 6) % 7) + 1 };
}

/** Días hábiles (lunes a viernes) completos entre una fecha y hoy. */
function diasHabilesDesde(d: Date, now: Date): number {
  let n = 0;
  const cursor = new Date(startOfLocalDay(d).getTime() + 86_400_000);
  const hoy = startOfLocalDay(now);
  while (cursor < hoy) {
    const dow = new Date(cursor.getTime() + 12 * 3_600_000 + OFFSET_MS).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
    cursor.setTime(cursor.getTime() + 86_400_000);
  }
  return n;
}

export async function tickTeam(agent: Agent, now: Date = new Date()): Promise<number> {
  const config = readTeamConfig(agent.config);
  if (!config.alerts.enabled) return 0;
  const { hora, dow } = horaLocal(now);
  if (dow > 5 || hora < 9 || hora >= 19) return 0;

  const clave = new Date(startOfLocalDay(now).getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  const desde = new Date(now.getTime() - 14 * 86_400_000);
  const alertas: string[] = [];

  for (const u of await auditedUsers(agent, config)) {
    const m = await userMetrics(u, desde, now, config, now);
    const casos: Array<[string, string]> = [];
    if (m.actividad.ultima && diasHabilesDesde(new Date(m.actividad.ultima), now) >= config.alerts.inactiveDays) {
      casos.push(["inactive", `${u.name} no registra actividad en el CRM desde el ${new Date(m.actividad.ultima).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}.`]);
    }
    if (m.tareas.vencidas >= config.alerts.overdueTasks) {
      casos.push(["overdue", `${u.name} tiene ${m.tareas.vencidas} tareas vencidas.`]);
    }
    if (m.mail.sinResponder > 0) {
      casos.push(["mail", `${u.name} tiene ${m.mail.sinResponder} mail(s) de clientes sin responder hace más de ${config.alerts.unansweredMailHours} h.`]);
    }
    for (const [tipo, texto] of casos) {
      try {
        await prisma.agentAction.create({
          data: {
            agentId: agent.id,
            origin: "RUN",
            type: "ALERT",
            status: "SENT",
            targetUserId: u.id,
            contactName: u.name,
            subject: texto,
            body: texto,
            dedupeKey: `${agent.id}:alert:${tipo}:${u.id}:${clave}`,
            sentAt: now,
          },
        });
        alertas.push(texto);
      } catch {
        // Ya se avisó hoy.
      }
    }
  }

  if (alertas.length) {
    await notifyAgentOwners(agent.id, {
      type: "AGENT_TEAM_ALERT",
      title: `${agent.name}: ${alertas.length} alerta(s) del equipo`,
      message: alertas.length === 1 ? alertas[0] : "Algunas cosas del equipo se salieron de lo normal:",
      link: `/agents/${agent.id}?tab=team`,
      detail: alertas.length > 1 ? alertas : undefined,
    });
  }
  return alertas.length;
}
