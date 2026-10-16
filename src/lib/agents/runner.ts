import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { conArriendo } from "@/lib/lock";
import { createLogger } from "@/lib/logger";
import { nextRunAfter } from "@/lib/agents/schedule";
import { checkBudgetAfterSpend, hasBudget } from "@/lib/agents/budget";
import { notifySuperadmins } from "@/lib/agents/notify";
import { runCollections } from "@/lib/agents/collections/run";

const log = createLogger("agents/runner");

/**
 * Ejecuta una ronda de un agente y la deja escrita en la bitácora (`AgentRun`).
 *
 * Lo dispara el cron del VPS contra `POST /api/internal/cron/agents` (mismo
 * patrón que el aviso de cuotas vencidas) o el botón "Ejecutar ahora". Nunca un
 * `setInterval` en el arranque del servidor.
 *
 * Una ronda por agente a la vez: el arriendo `agent:<id>` frena a la segunda.
 */

const TTL_ARRIENDO_MS = 10 * 60_000;

export type RunOutcome =
  | { ok: true; runId: string; status: string; summary: string }
  | { ok: false; reason: "BUSY" | "NOT_FOUND" };

export async function runAgent(params: {
  agentId: string;
  trigger: "SCHEDULE" | "MANUAL";
  userId?: string;
  now?: Date;
}): Promise<RunOutcome> {
  const now = params.now ?? new Date();
  const agent = await prisma.agent.findUnique({ where: { id: params.agentId } });
  if (!agent) return { ok: false, reason: "NOT_FOUND" };

  const resultado = await conArriendo(`agent:${agent.id}`, TTL_ARRIENDO_MS, async (): Promise<RunOutcome> => {
    // El horario avanza antes de trabajar: si la ronda se cae a la mitad, el
    // cron no la reintenta en bucle cada 15 minutos.
    if (params.trigger === "SCHEDULE") {
      await prisma.agent.update({
        where: { id: agent.id },
        data: { nextRunAt: nextRunAfter(agent.scheduleTime, agent.scheduleDays, now) },
      });
    }

    const run = await prisma.agentRun.create({
      data: { agentId: agent.id, trigger: params.trigger, startedById: params.userId ?? null },
      select: { id: true },
    });

    try {
      const r = await runCollections({ agent, runId: run.id, now });
      const status = r.stats.fallidas > 0 ? "PARTIAL" : "SUCCESS";
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status,
          finishedAt: new Date(),
          summary: r.summary,
          stats: r.stats as unknown as Prisma.InputJsonValue,
          inputTokens: r.spend.inputTokens,
          outputTokens: r.spend.outputTokens,
          costUsd: new Prisma.Decimal(r.spend.costUsd.toFixed(6)),
        },
      });

      // El parte de la ronda también queda en el chat: es la memoria del agente
      // y lo primero que ve quien abre la conversación.
      await prisma.agentMessage.create({
        data: {
          agentId: agent.id,
          role: "ASSISTANT",
          content: `**Ronda ${params.trigger === "MANUAL" ? "manual" : "programada"}** — ${r.summary}`,
          attachments: r.stats.pendientes > 0 ? ([{ type: "pending_link", count: r.stats.pendientes }] as Prisma.InputJsonValue) : undefined,
        },
      });

      if (r.spend.costUsd > 0) await checkBudgetAfterSpend(agent.id, now);

      if (r.nuevasPendientes.length > 0) {
        await notifySuperadmins({
          type: "AGENT_PENDING_APPROVAL",
          title: `${agent.name}: ${r.nuevasPendientes.length} reclamo(s) para aprobar`,
          message: `La ronda dejó ${r.nuevasPendientes.length} reclamo(s) esperando tu aprobación. Se pueden aprobar desde la bandeja del agente o pidiéndoselo en el chat.`,
          link: `/agents/${agent.id}?tab=pending`,
          detail: r.nuevasPendientes.slice(0, 25),
        });
      }
      if (status === "PARTIAL") {
        await notifySuperadmins({
          type: "AGENT_RUN_PARTIAL",
          title: `${agent.name}: ${r.stats.fallidas} envío(s) fallaron`,
          message: "La ronda terminó, pero algunos mails no salieron. El detalle está en Ejecuciones.",
          link: `/agents/${agent.id}?tab=runs`,
        });
      }
      return { ok: true, runId: run.id, status, summary: r.summary };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log.error({ err, agentId: agent.id }, "La ronda del agente falló");
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: new Date(), error: detail },
      });
      await notifySuperadmins({
        type: "AGENT_RUN_FAILED",
        title: `La ronda de "${agent.name}" falló`,
        message: `Error: ${detail}`,
        link: `/agents/${agent.id}?tab=runs`,
      });
      return { ok: true, runId: run.id, status: "FAILED", summary: detail };
    }
  });

  return resultado ?? { ok: false, reason: "BUSY" };
}

/** Lo que llama el cron: corre los agentes activos a los que ya les tocaba. */
export async function runDueAgents(now: Date = new Date()) {
  const vencidos = await prisma.agent.findMany({
    where: { status: { in: ["ACTIVE", "PAUSED_BUDGET"] }, nextRunAt: { lte: now } },
    select: { id: true, status: true },
  });
  const resultados: Array<{ agentId: string; status: string }> = [];
  for (const a of vencidos) {
    // Un agente pausado por gasto no trabaja, pero su horario sigue corriendo
    // para que al volver el mes no dispare todas las rondas atrasadas juntas.
    if (a.status === "PAUSED_BUDGET") {
      if (!(await hasBudget(a.id, now))) {
        const ag = await prisma.agent.findUniqueOrThrow({ where: { id: a.id }, select: { scheduleTime: true, scheduleDays: true } });
        await prisma.agent.update({ where: { id: a.id }, data: { nextRunAt: nextRunAfter(ag.scheduleTime, ag.scheduleDays, now) } });
        resultados.push({ agentId: a.id, status: "SKIPPED_BUDGET" });
        continue;
      }
    }
    const r = await runAgent({ agentId: a.id, trigger: "SCHEDULE", now });
    resultados.push({ agentId: a.id, status: r.ok ? r.status : r.reason });
  }
  return resultados;
}
