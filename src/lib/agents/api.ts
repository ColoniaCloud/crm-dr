import { NextResponse } from "next/server";
import type { Agent } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canApproveAgentActions, canChatWithAgent, canConfigureAgents } from "@/lib/agents/access";
import { monthSpendUsd } from "@/lib/agents/budget";
import { kindInfo } from "@/lib/agents/catalog";

/** Utilidades compartidas por las rutas de /api/agents. */

export interface AgentActor {
  userId: string;
  name: string;
  role: string;
}

type Gate<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

export async function requireActor(): Promise<Gate<AgentActor>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  return {
    ok: true,
    value: { userId: session.user.id, name: session.user.name || "Usuario", role: session.user.role },
  };
}

export function forbidden(message = "No tenés permiso para esto.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Busca el agente y verifica que el usuario al menos pueda chatear con él. Si no
 * puede, responde 404 y no 403: un OPERATOR no tiene por qué saber que existe.
 */
export async function loadAgentFor(actor: AgentActor, id: string): Promise<Gate<Agent>> {
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent || !canChatWithAgent(actor.role, agent)) {
    return { ok: false, response: NextResponse.json({ error: "Agente no encontrado" }, { status: 404 }) };
  }
  return { ok: true, value: agent };
}

export async function serializeAgent(agent: Agent, actor: AgentActor) {
  const [pendientes, gasto, ultima] = await Promise.all([
    prisma.agentAction.count({ where: { agentId: agent.id, status: "PENDING_APPROVAL" } }),
    monthSpendUsd(agent.id),
    prisma.agentRun.findFirst({
      where: { agentId: agent.id },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, status: true, summary: true },
    }),
  ]);
  const puedeConfigurar = canConfigureAgents(actor.role);
  return {
    id: agent.id,
    kind: agent.kind,
    kindLabel: kindInfo(agent.kind).label,
    name: agent.name,
    status: agent.status,
    instructions: agent.instructions,
    // La configuración (plantillas, excluidos) solo la ve quien la puede cambiar.
    config: puedeConfigurar ? agent.config : null,
    scheduleTime: agent.scheduleTime,
    scheduleDays: agent.scheduleDays,
    nextRunAt: agent.nextRunAt?.toISOString() ?? null,
    model: agent.model,
    monthlyBudgetUsd: Number(agent.monthlyBudgetUsd),
    monthSpendUsd: gasto,
    operatorCanChat: agent.operatorCanChat,
    pendingCount: pendientes,
    lastRun: ultima
      ? { startedAt: ultima.startedAt.toISOString(), status: ultima.status, summary: ultima.summary }
      : null,
    permissions: {
      configure: puedeConfigurar,
      approve: canApproveAgentActions(actor.role),
    },
  };
}

/** Fecha "YYYY-MM-DD" de Buenos Aires a instante, al principio o al final del día. */
export function parseLocalDay(raw: string | null, endOfDay: boolean): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T${endOfDay ? "23:59:59" : "00:00:00"}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
