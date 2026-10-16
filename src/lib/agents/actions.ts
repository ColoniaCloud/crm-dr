import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
import { sendAgentMail } from "@/lib/agents/mail";
import { readCollectionsConfig } from "@/lib/agents/collections/config";

const log = createLogger("agents/actions");

/**
 * Lo que un agente hizo o quiere hacer: hoy, mandarle un mail a un cliente.
 *
 * Una acción se manda una sola vez aunque dos personas aprueben a la vez: antes
 * de enviar se "reclama" con un UPDATE condicionado a que nadie la haya tomado
 * (`approvedAt` vacío o vencido). El que pierde la carrera no hace nada.
 *
 * Y antes de mandar se vuelve a mirar la venta: entre que la ronda armó el
 * reclamo y alguien lo aprobó, el cliente pudo haber pagado o declarado el pago.
 */

const CLAIM_TTL_MS = 10 * 60_000;

export type SendOutcome = "SENT" | "FAILED" | "DISCARDED" | "SKIPPED";

/** ¿La venta sigue teniendo saldo y sin un pago declarado pendiente de revisión? */
async function saleStillOwes(saleId: string): Promise<{ owes: boolean; reason?: string }> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      status: true,
      total: true,
      payments: { select: { amount: true } },
      paymentDeclarations: { where: { status: "PENDING" }, select: { id: true } },
    },
  });
  if (!sale || sale.status === "CANCELLED") return { owes: false, reason: "La venta ya no existe o se anuló." };
  const saldo = Number(sale.total) - sale.payments.reduce((t, p) => t + Number(p.amount), 0);
  if (saldo <= 0.01) return { owes: false, reason: "La venta ya no tiene saldo pendiente." };
  if (sale.paymentDeclarations.length > 0) {
    return { owes: false, reason: "El cliente declaró un pago que todavía no se revisó." };
  }
  return { owes: true };
}

/**
 * Manda una acción. `approverId` es quien la aprobó (null en los envíos
 * automáticos de la ronda). Devuelve "SKIPPED" si otro proceso la estaba
 * mandando.
 */
export async function executeAction(actionId: string, approverId: string | null): Promise<SendOutcome> {
  const ahora = new Date();
  const { count } = await prisma.agentAction.updateMany({
    where: {
      id: actionId,
      status: "PENDING_APPROVAL",
      OR: [{ approvedAt: null }, { approvedAt: { lt: new Date(ahora.getTime() - CLAIM_TTL_MS) } }],
    },
    data: { approvedAt: ahora, approvedById: approverId },
  });
  if (count === 0) return "SKIPPED";

  const action = await prisma.agentAction.findUniqueOrThrow({
    where: { id: actionId },
    include: { agent: { select: { config: true } } },
  });

  if (action.saleId) {
    const { owes, reason } = await saleStillOwes(action.saleId);
    if (!owes) {
      await prisma.agentAction.update({ where: { id: actionId }, data: { status: "DISCARDED", error: reason } });
      return "DISCARDED";
    }
  }

  const config = readCollectionsConfig(action.agent.config);
  try {
    const res = await sendAgentMail({
      contactId: action.contactId,
      subject: action.subject,
      body: action.body,
      replyTo: config.replyTo,
    });
    await prisma.agentAction.update({
      where: { id: actionId },
      data: { status: "SENT", sentAt: new Date(), simulated: res.simulated, error: null },
    });
    return "SENT";
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error({ err, actionId }, "Falló el envío de una acción de agente");
    await prisma.agentAction.update({ where: { id: actionId }, data: { status: "FAILED", error: detail } });
    return "FAILED";
  }
}

export async function approveActions(params: {
  agentId: string;
  actionIds: string[];
  userId: string;
}): Promise<Record<SendOutcome, number>> {
  const acciones = await prisma.agentAction.findMany({
    where: { id: { in: params.actionIds }, agentId: params.agentId, status: "PENDING_APPROVAL" },
    select: { id: true, contactName: true, saleNumber: true },
  });
  const resultado: Record<SendOutcome, number> = { SENT: 0, FAILED: 0, DISCARDED: 0, SKIPPED: 0 };
  // De a una: son pocos mails y el SMTP de Hostinger corta las ráfagas.
  for (const a of acciones) {
    resultado[await executeAction(a.id, params.userId)]++;
  }
  if (acciones.length > 0) {
    await logOperatorAction({
      userId: params.userId,
      action: "AGENT_ACTIONS_APPROVED",
      entityType: "Agent",
      entityId: params.agentId,
      description: `Aprobó ${acciones.length} envío(s) del agente: ${resultado.SENT} enviados, ${resultado.FAILED} fallidos, ${resultado.DISCARDED} descartados por pago.`,
      link: `/agents/${params.agentId}`,
    });
  }
  return resultado;
}

export async function discardActions(params: { agentId: string; actionIds: string[]; userId: string }) {
  const { count } = await prisma.agentAction.updateMany({
    where: { id: { in: params.actionIds }, agentId: params.agentId, status: "PENDING_APPROVAL" },
    data: { status: "DISCARDED", approvedById: params.userId, approvedAt: new Date() },
  });
  if (count > 0) {
    await logOperatorAction({
      userId: params.userId,
      action: "AGENT_ACTIONS_DISCARDED",
      entityType: "Agent",
      entityId: params.agentId,
      description: `Descartó ${count} envío(s) del agente.`,
      link: `/agents/${params.agentId}`,
    });
  }
  return count;
}

export async function editAction(params: {
  agentId: string;
  actionId: string;
  subject: string;
  body: string;
  userId: string;
}): Promise<boolean> {
  const { count } = await prisma.agentAction.updateMany({
    where: { id: params.actionId, agentId: params.agentId, status: "PENDING_APPROVAL", approvedAt: null },
    data: { subject: params.subject, body: params.body },
  });
  if (count > 0) {
    await logOperatorAction({
      userId: params.userId,
      action: "AGENT_ACTION_EDITED",
      entityType: "Agent",
      entityId: params.agentId,
      description: "Editó el texto de un envío pendiente del agente.",
      link: `/agents/${params.agentId}`,
    });
  }
  return count > 0;
}

/** "No contactar más": lo saca de las próximas rondas y descarta lo que tenía pendiente. */
export async function excludeContact(params: { agentId: string; contactId: string; userId: string }) {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: params.agentId }, select: { config: true } });
  const config = readCollectionsConfig(agent.config);
  if (!config.excludedContactIds.includes(params.contactId)) {
    config.excludedContactIds.push(params.contactId);
  }
  await prisma.agent.update({
    where: { id: params.agentId },
    data: { config: config as unknown as Prisma.InputJsonValue },
  });
  const descartadas = await prisma.agentAction.updateMany({
    where: { agentId: params.agentId, contactId: params.contactId, status: "PENDING_APPROVAL", approvedAt: null },
    data: { status: "DISCARDED", error: "Cliente marcado como no contactar.", approvedById: params.userId, approvedAt: new Date() },
  });
  await logOperatorAction({
    userId: params.userId,
    action: "AGENT_CONTACT_EXCLUDED",
    entityType: "Agent",
    entityId: params.agentId,
    description: `Marcó un cliente como "no contactar" para el agente (${descartadas.count} pendiente(s) descartado(s)).`,
    link: `/agents/${params.agentId}`,
  });
}

export async function includeContact(params: { agentId: string; contactId: string }) {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: params.agentId }, select: { config: true } });
  const config = readCollectionsConfig(agent.config);
  config.excludedContactIds = config.excludedContactIds.filter((id) => id !== params.contactId);
  await prisma.agent.update({
    where: { id: params.agentId },
    data: { config: config as unknown as Prisma.InputJsonValue },
  });
}
