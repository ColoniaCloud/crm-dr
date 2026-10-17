import type { Agent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { aiAvailable, complete, modelFor } from "@/lib/agents/llm";
import { hasBudget } from "@/lib/agents/budget";
import { addSpend, NO_SPEND, type Spend } from "@/lib/agents/models";
import { calendarDaysBetween, formatLocalDate, startOfLocalDay } from "@/lib/agents/schedule";
import { readTeamConfig, type TeamConfig } from "@/lib/agents/team/config";
import { auditedUsers, teamMetrics, type UserMetrics } from "@/lib/agents/team/metrics";
import { deliverToUser, FIRMA } from "@/lib/agents/team/deliver";
import type { AgentNotice } from "@/lib/agents/kinds/types";

const log = createLogger("agents/team-run");

/**
 * La ronda diaria del Supervisor del equipo (AGENTES.md, "Supervisor del equipo"):
 *
 *   1. a cada empleado con algo que vence hoy o atrasado, UN mensaje amable
 *      (campanita y mail): un recordatorio por día como máximo;
 *   2. lo que lleva más de `escalateAfterDays` de atraso ya no se le recuerda al
 *      empleado: se les avisa a los dueños, una sola vez por tarea;
 *   3. el día del resumen semanal, les manda a los dueños cómo viene cada uno.
 *
 * Las alertas en el momento van aparte, en `tick.ts`.
 */

export interface TeamRunStats {
  auditados: number;
  recordatorios: number;
  escaladas: number;
  resumenSemanal: boolean;
}

interface TareaAbierta {
  id: string;
  title: string;
  dueDate: Date | null;
  diasAtraso: number;
}

function dia(now: Date): string {
  return new Date(startOfLocalDay(now).getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

function mensajeBase(nombre: string, hoy: TareaAbierta[], atrasadas: TareaAbierta[]): string {
  const partes = [`Hola ${nombre.split(" ")[0]}:`];
  if (hoy.length) partes.push(`Hoy vence${hoy.length > 1 ? "n" : ""}:\n${hoy.map((t) => `• ${t.title}`).join("\n")}`);
  if (atrasadas.length) {
    partes.push(
      `Y quedaron pendientes de días anteriores:\n${atrasadas.map((t) => `• ${t.title} (vencía el ${formatLocalDate(t.dueDate!)})`).join("\n")}`
    );
  }
  partes.push("Si alguna ya no corresponde o necesitás ayuda, avisale a quien te la asignó así se reorganiza. ¡Gracias!");
  partes.push(FIRMA);
  return partes.join("\n\n");
}

/** La IA reescribe el mensaje con calidez, sin cambiar los datos. Si falla, queda el base. */
async function redactar(agent: Agent, base: string): Promise<{ text: string; spend: Spend }> {
  if (!aiAvailable() || !(await hasBudget(agent.id))) return { text: base, spend: NO_SPEND };
  try {
    const { text, spend } = await complete({
      model: modelFor(agent),
      maxTokens: 800,
      system: `Sos el "${FIRMA}" del CRM de Kristall Film. Reescribís un recordatorio interno para un empleado: cálido, breve, en español rioplatense, sin presionar ni retar, sin mencionar que se lo audita ni compararlo con nadie. Conservá exactamente las tareas y fechas de la lista, en viñetas. El mensaje es automático y no se puede responder: no invites a contestarte; si necesita ayuda o reorganizar algo, que le avise a quien le asignó la tarea. Terminá con la firma "${FIRMA}". Devolvé solo el texto del mensaje.

Indicaciones del equipo para tu tono:
${agent.instructions}`,
      prompt: base,
    });
    return { text: text || base, spend };
  } catch (err) {
    log.warn({ err }, "No se pudo redactar el recordatorio con IA; queda el base");
    return { text: base, spend: NO_SPEND };
  }
}

export function lineaResumen(m: UserMetrics): string {
  const t = m.tareas;
  const partes = [
    `${t.completadas} tarea(s) cerrada(s)${t.completadas ? ` (${t.completadasATiempo} a tiempo)` : ""}`,
    t.vencidas ? `${t.vencidas} vencida(s)` : null,
    m.leads.contactados ? `${m.leads.contactados} lead(s) contactado(s)` : null,
    m.leads.asignadosSinContactar ? `${m.leads.asignadosSinContactar} lead(s) asignado(s) sin contactar` : null,
    `${m.actividad.acciones} acción(es) en el CRM`,
    m.mail.tieneCasilla
      ? `mail: ${m.mail.respondidos}/${m.mail.recibidos} respondidos${m.mail.horasRespuestaMediana !== null ? `, ${m.mail.horasRespuestaMediana} h de mediana` : ""}${m.mail.sinResponder ? `, ${m.mail.sinResponder} sin responder` : ""}`
      : "sin casilla de mail en el CRM",
  ];
  return `${m.name}: ${partes.filter(Boolean).join(" · ")}`;
}

export async function runTeam(params: { agent: Agent; runId: string; now: Date }) {
  const { agent, runId, now } = params;
  const config: TeamConfig = readTeamConfig(agent.config);
  const usuarios = await auditedUsers(agent, config);
  const hoy = startOfLocalDay(now);
  const manana = new Date(hoy.getTime() + 86_400_000);
  const clave = dia(now);
  let spend = NO_SPEND;
  const notify: AgentNotice[] = [];
  let recordatorios = 0;
  const escaladas: string[] = [];

  for (const u of usuarios) {
    const tareas: TareaAbierta[] = (
      await prisma.crmTask.findMany({
        where: { userId: u.id, done: false, dueDate: { lt: manana } },
        select: { id: true, title: true, dueDate: true },
        orderBy: { dueDate: "asc" },
      })
    ).map((t) => ({ ...t, diasAtraso: t.dueDate ? calendarDaysBetween(t.dueDate, now) : 0 }));

    const deHoy = tareas.filter((t) => t.dueDate && t.dueDate >= hoy);
    const atrasadas = tareas.filter((t) => t.dueDate && t.dueDate < hoy && t.diasAtraso <= config.escalateAfterDays);
    const paraEscalar = tareas.filter((t) => t.dueDate && t.dueDate < hoy && t.diasAtraso > config.escalateAfterDays);

    // 1. Un mensaje por día, como máximo.
    const incluirHoy = config.morningSummary ? deHoy : [];
    const incluirAtrasos = config.overdueReminders ? atrasadas : [];
    if (incluirHoy.length || incluirAtrasos.length) {
      const { text, spend: s } = await redactar(agent, mensajeBase(u.name, incluirHoy, incluirAtrasos));
      spend = addSpend(spend, s);
      const asunto = incluirAtrasos.length
        ? `Tenés ${incluirHoy.length + incluirAtrasos.length} tarea(s) para hoy`
        : `Lo que vence hoy (${incluirHoy.length})`;
      const enviado = await deliverToUser({
        agentId: agent.id,
        runId,
        user: u,
        type: "REMINDER",
        subject: asunto,
        body: text,
        link: "/assistant",
        channels: config.channels,
        dedupeKey: `${agent.id}:rem:${u.id}:${clave}`,
      });
      if (enviado) recordatorios++;
    }

    // 2. Escalar a los dueños, una vez por tarea.
    for (const t of paraEscalar) {
      try {
        await prisma.agentAction.create({
          data: {
            agentId: agent.id,
            runId,
            origin: "RUN",
            type: "ESCALATION",
            status: "SENT",
            targetUserId: u.id,
            contactName: u.name,
            subject: `Atraso de ${t.diasAtraso} días: ${t.title}`,
            body: `${u.name} tiene "${t.title}" vencida desde el ${formatLocalDate(t.dueDate!)}. Ya no se le recuerda: queda para que la vean ustedes.`,
            dedupeKey: `${agent.id}:esc:${t.id}`,
            sentAt: now,
          },
        });
        escaladas.push(`${u.name}: "${t.title}" (${t.diasAtraso} días de atraso)`);
      } catch {
        // Ya se había escalado: la clave única no deja repetirlo.
      }
    }
  }

  if (escaladas.length) {
    notify.push({
      type: "AGENT_TEAM_ESCALATION",
      title: `${agent.name}: ${escaladas.length} tarea(s) muy atrasada(s)`,
      message: `Estas tareas pasaron los ${config.escalateAfterDays} días de atraso. Dejé de recordárselas a cada persona; quedan para que las vean ustedes.`,
      link: `/agents/${agent.id}?tab=team`,
      detail: escaladas,
    });
  }

  // 3. Resumen semanal.
  let resumenSemanal = false;
  const isoDow = ((new Date(hoy.getTime() + 3 * 3_600_000).getUTCDay() + 6) % 7) + 1;
  if (config.weeklyReport && isoDow === config.weeklyDay) {
    try {
      await prisma.agentAction.create({
        data: {
          agentId: agent.id,
          runId,
          origin: "RUN",
          type: "WEEKLY_REPORT",
          status: "SENT",
          contactName: "Dueños",
          subject: `Resumen semanal ${clave}`,
          body: "",
          dedupeKey: `${agent.id}:weekly:${clave}`,
          sentAt: now,
        },
      });
      const desde = new Date(hoy.getTime() - 7 * 86_400_000);
      const metricas = await teamMetrics(agent, config, desde, now, now);
      const lineas = metricas.map(lineaResumen);
      let comentario = "Así vino la semana de cada uno.";
      if (aiAvailable() && (await hasBudget(agent.id, now))) {
        try {
          const r = await complete({
            model: modelFor(agent),
            maxTokens: 1500,
            system: `Sos "${agent.name}", el supervisor del equipo en el CRM de Kristall Film. Escribís para los dueños (Carlos y Manuel) un comentario de la semana: 4 a 8 líneas, concreto, en español rioplatense. Primero lo que necesita su atención (personas o frentes flojos), después lo que anduvo bien. Justo y sin adjetivos de más. No inventes datos.`,
            prompt: JSON.stringify(metricas),
          });
          comentario = r.text || comentario;
          spend = addSpend(spend, r.spend);
        } catch (err) {
          log.warn({ err }, "No se pudo comentar el resumen semanal");
        }
      }
      notify.push({
        type: "AGENT_TEAM_WEEKLY",
        title: `${agent.name}: resumen de la semana`,
        message: comentario,
        link: `/agents/${agent.id}?tab=team`,
        detail: lineas,
      });
      resumenSemanal = true;
    } catch {
      // Ya se mandó el de esta semana.
    }
  }

  const stats: TeamRunStats = { auditados: usuarios.length, recordatorios, escaladas: escaladas.length, resumenSemanal };
  const summary = [
    `Revisé las tareas de ${usuarios.length} persona(s).`,
    recordatorios ? `Mandé ${recordatorios} recordatorio(s) amable(s).` : "Nadie tenía tareas para hoy ni atrasadas que recordar.",
    escaladas.length ? `Les paso ${escaladas.length} tarea(s) con más de ${config.escalateAfterDays} días de atraso: ${escaladas.join("; ")}.` : null,
    resumenSemanal ? "Les mandé el resumen de la semana." : null,
  ]
    .filter(Boolean)
    .join(" ");

  return { stats, summary, spend, notify };
}
