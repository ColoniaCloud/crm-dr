import { prisma } from "@/lib/prisma";
import { monthKey, startOfLocalMonth } from "@/lib/agents/schedule";
import { notifySuperadmins } from "@/lib/agents/notify";

/**
 * Tope de gasto mensual por agente (decisión 10 de AGENTES.md).
 *
 * El gasto no se guarda en una columna: es la suma de lo que costó cada ronda y
 * cada mensaje del chat en el mes, igual que el estado de una cuota se calcula
 * al leer en vez de guardarse.
 *
 * Al 80 % avisa una vez por mes (`budgetWarnedFor`). Al 100 % el agente pasa a
 * PAUSED_BUDGET y deja de llamar a la IA; el mes siguiente vuelve solo a ACTIVE.
 * Una pausa a mano (PAUSED) no se levanta sola.
 */

export async function monthSpendUsd(agentId: string, now: Date = new Date()): Promise<number> {
  const desde = startOfLocalMonth(now);
  const [runs, msgs] = await Promise.all([
    prisma.agentRun.aggregate({ where: { agentId, startedAt: { gte: desde } }, _sum: { costUsd: true } }),
    prisma.agentMessage.aggregate({ where: { agentId, createdAt: { gte: desde } }, _sum: { costUsd: true } }),
  ]);
  return Number(runs._sum.costUsd ?? 0) + Number(msgs._sum.costUsd ?? 0);
}

/**
 * ¿Puede llamar a la IA ahora? De paso, reactiva un agente pausado por gasto si
 * ya cambió el mes.
 */
export async function hasBudget(agentId: string, now: Date = new Date()): Promise<boolean> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { status: true, monthlyBudgetUsd: true },
  });
  if (!agent) return false;
  const gastado = await monthSpendUsd(agentId, now);
  const tope = Number(agent.monthlyBudgetUsd);
  if (agent.status === "PAUSED_BUDGET" && gastado < tope) {
    await prisma.agent.update({ where: { id: agentId }, data: { status: "ACTIVE" } });
  }
  return gastado < tope;
}

/** Después de gastar: avisa al 80 % y pausa al 100 %. */
export async function checkBudgetAfterSpend(agentId: string, now: Date = new Date()): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { name: true, status: true, monthlyBudgetUsd: true, budgetWarnedFor: true },
  });
  if (!agent) return;
  const tope = Number(agent.monthlyBudgetUsd);
  if (tope <= 0) return;
  const gastado = await monthSpendUsd(agentId, now);
  const mes = monthKey(now);
  const link = `/agents/${agentId}`;
  const cifra = `US$ ${gastado.toFixed(2)} de US$ ${tope.toFixed(2)}`;

  if (gastado >= tope && agent.status === "ACTIVE") {
    await prisma.agent.update({ where: { id: agentId }, data: { status: "PAUSED_BUDGET" } });
    await notifySuperadmins({
      type: "AGENT_BUDGET_PAUSED",
      title: `El agente "${agent.name}" se pausó por gasto`,
      message: `Llegó al tope del mes (${cifra}). Vuelve solo el mes que viene, o subí el tope desde su configuración.`,
      link,
    });
    return;
  }

  if (gastado >= tope * 0.8 && agent.budgetWarnedFor !== mes) {
    await prisma.agent.update({ where: { id: agentId }, data: { budgetWarnedFor: mes } });
    await notifySuperadmins({
      type: "AGENT_BUDGET_WARNING",
      title: `El agente "${agent.name}" usó el 80 % de su tope`,
      message: `Lleva ${cifra} este mes. Al llegar al 100 % se pausa solo.`,
      link,
    });
  }
}
