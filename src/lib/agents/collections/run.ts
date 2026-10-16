import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { executeAction } from "@/lib/agents/actions";
import { readCollectionsConfig } from "@/lib/agents/collections/config";
import { computeDebts, dedupeKeyFor, formatAmount, renderForDebt, type Debt } from "@/lib/agents/collections/debts";
import { NO_SPEND, type Spend } from "@/lib/agents/models";
import { aiAvailable, complete, modelFor } from "@/lib/agents/llm";
import { hasBudget } from "@/lib/agents/budget";

const log = createLogger("agents/collections");

/**
 * La ronda de Cobranzas (sección "La ronda diaria" de AGENTES.md):
 *
 *   1-3. calcular deudas y su paso — `computeDebts`, sin IA;
 *   4.   crear una acción por deuda y paso, con clave única;
 *   5.   el texto sale de la plantilla del paso;
 *   6.   los pasos automáticos se mandan, el resto queda en la bandeja;
 *   7.   la IA resume la ronda con los números (sin datos de contacto).
 */

export interface CollectionsRunStats {
  revisadas: number;
  enviadas: number;
  pendientes: number;
  fallidas: number;
  descartadas: number;
  yaAvisadas: number;
  sinEmail: number;
  declaracionPendiente: number;
  excluidas: number;
  escaladas: number;
  montoEscalado: Record<string, number>;
}

export interface CollectionsRunResult {
  stats: CollectionsRunStats;
  summary: string;
  spend: Spend;
  /** Lo que quedó esperando aprobación en esta ronda, para el mail de aviso. */
  nuevasPendientes: string[];
  escaladas: string[];
}

export async function runCollections(params: {
  agent: { id: string; name: string; config: unknown; instructions: string; model: string };
  runId: string;
  now?: Date;
}): Promise<CollectionsRunResult> {
  const now = params.now ?? new Date();
  const config = readCollectionsConfig(params.agent.config);
  const debts = await computeDebts(config, now);

  const stats: CollectionsRunStats = {
    revisadas: debts.length,
    enviadas: 0,
    pendientes: 0,
    fallidas: 0,
    descartadas: 0,
    yaAvisadas: 0,
    sinEmail: 0,
    declaracionPendiente: 0,
    excluidas: 0,
    escaladas: 0,
    montoEscalado: {},
  };
  const nuevasPendientes: string[] = [];
  const escaladas: string[] = [];
  const movimientos: string[] = [];

  const candidatas: Debt[] = [];
  for (const d of debts) {
    switch (d.skip) {
      case "NOT_YET":
        break;
      case "NO_EMAIL":
        stats.sinEmail++;
        break;
      case "DECLARATION_PENDING":
        stats.declaracionPendiente++;
        break;
      case "EXCLUDED":
        stats.excluidas++;
        break;
      case "ESCALATED":
        stats.escaladas++;
        stats.montoEscalado[d.currency] = (stats.montoEscalado[d.currency] ?? 0) + d.amount;
        escaladas.push(`${d.contactName} — venta #${d.saleNumber}: ${formatAmount(d.amount, d.currency)}, ${d.daysPastDue} días vencido`);
        break;
      default:
        candidatas.push(d);
    }
  }

  const claves = candidatas.map(dedupeKeyFor).filter((k): k is string => Boolean(k));
  const existentes = new Set(
    (await prisma.agentAction.findMany({ where: { dedupeKey: { in: claves } }, select: { dedupeKey: true } })).map(
      (a) => a.dedupeKey
    )
  );

  for (const d of candidatas) {
    const step = d.step!;
    const dedupeKey = dedupeKeyFor(d)!;
    if (existentes.has(dedupeKey)) {
      stats.yaAvisadas++;
      continue;
    }
    const { subject, body } = await renderForDebt(d, step.subject, step.body, config, now);

    let actionId: string;
    try {
      const creada = await prisma.agentAction.create({
        data: {
          agentId: params.agent.id,
          runId: params.runId,
          origin: "RUN",
          type: "SEND_EMAIL",
          status: "PENDING_APPROVAL",
          contactId: d.contactId,
          contactName: d.contactName,
          saleId: d.saleId,
          saleNumber: d.saleNumber,
          installmentId: d.installmentId,
          step: step.key,
          amount: new Prisma.Decimal(d.amount),
          dueDate: d.dueDate,
          dedupeKey,
          subject,
          body,
        },
        select: { id: true },
      });
      actionId = creada.id;
    } catch (err) {
      // Otra ronda la creó primero: la clave única hizo su trabajo.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        stats.yaAvisadas++;
        continue;
      }
      throw err;
    }

    const linea = `${d.contactName} — venta #${d.saleNumber} ${d.installmentLabel}: ${formatAmount(d.amount, d.currency)} (${step.label})`;
    if (step.requiresApproval) {
      stats.pendientes++;
      nuevasPendientes.push(linea);
      movimientos.push(`PENDIENTE DE APROBACIÓN · ${linea}`);
      continue;
    }

    const resultado = await executeAction(actionId, null);
    if (resultado === "SENT") stats.enviadas++;
    else if (resultado === "FAILED") stats.fallidas++;
    else if (resultado === "DISCARDED") stats.descartadas++;
    movimientos.push(`${resultado === "SENT" ? "ENVIADO" : resultado === "FAILED" ? "FALLÓ" : "DESCARTADO"} · ${linea}`);
  }

  const { summary, spend } = await summarize({ agent: params.agent, stats, movimientos, escaladas, now });
  return { stats, summary, spend, nuevasPendientes, escaladas };
}

function plainSummary(stats: CollectionsRunStats): string {
  const partes = [
    `Revisé ${stats.revisadas} deuda(s).`,
    stats.enviadas ? `Mandé ${stats.enviadas} aviso(s).` : null,
    stats.pendientes ? `Dejé ${stats.pendientes} reclamo(s) esperando aprobación.` : null,
    stats.fallidas ? `${stats.fallidas} envío(s) fallaron.` : null,
    stats.descartadas ? `${stats.descartadas} se descartaron porque la venta ya no tenía saldo.` : null,
    stats.sinEmail ? `${stats.sinEmail} cliente(s) no tienen email.` : null,
    stats.declaracionPendiente ? `${stats.declaracionPendiente} están en pausa por un pago declarado sin revisar.` : null,
    stats.escaladas ? `${stats.escaladas} deuda(s) superan el atraso máximo y quedan para seguimiento personal.` : null,
  ];
  return partes.filter(Boolean).join(" ");
}

async function summarize(params: {
  agent: { id: string; name: string; instructions: string; model: string };
  stats: CollectionsRunStats;
  movimientos: string[];
  escaladas: string[];
  now: Date;
}): Promise<{ summary: string; spend: Spend }> {
  const base = plainSummary(params.stats);
  const huboAlgo = params.movimientos.length > 0 || params.stats.escaladas > 0 || params.stats.fallidas > 0;
  if (!huboAlgo || !aiAvailable() || !(await hasBudget(params.agent.id, params.now))) {
    return { summary: base, spend: NO_SPEND };
  }
  try {
    const { text, spend } = await complete({
      model: modelFor(params.agent),
      maxTokens: 1500,
      system:
        `Sos "${params.agent.name}", el agente de cobranzas del CRM de Kristall Film. Escribís el parte de la ronda que acabás de terminar, en español rioplatense, en primera persona, breve (máximo 8 líneas), sin saludo ni despedida. Primero lo importante: qué necesita la atención de una persona. No inventes datos que no estén en la lista.`,
      prompt: [
        `Números de la ronda: ${JSON.stringify(params.stats)}`,
        params.movimientos.length ? `Movimientos:\n${params.movimientos.slice(0, 60).join("\n")}` : "Sin movimientos nuevos.",
        params.escaladas.length ? `Deudas escaladas (ya no se les escribe):\n${params.escaladas.slice(0, 30).join("\n")}` : "",
      ].join("\n\n"),
    });
    return { summary: text || base, spend };
  } catch (err) {
    log.warn({ err }, "No se pudo resumir la ronda con IA; queda el resumen simple");
    return { summary: base, spend: NO_SPEND };
  }
}
