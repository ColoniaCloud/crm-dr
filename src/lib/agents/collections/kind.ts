import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { monthSpendUsd } from "@/lib/agents/budget";
import { formatLocalDate, formatLocalDateTime } from "@/lib/agents/schedule";
import { collectionsConfigSchema, defaultCollectionsConfig, readCollectionsConfig, PLACEHOLDERS } from "@/lib/agents/collections/config";
import { computeDebts, formatAmount, renderForDebt } from "@/lib/agents/collections/debts";
import { buildCollectionsReport, montos } from "@/lib/agents/collections/report";
import { runCollections } from "@/lib/agents/collections/run";
import { NOT_HANDLED, type AgentKindImpl, type ToolContext } from "@/lib/agents/kinds/types";

/** El agente de Cobranzas, enchufado a la base común (ronda, chat, configuración). */

const TOOLS: Anthropic.Tool[] = [
  {
    name: "ver_estado",
    description: "Estado del agente: activo o pausado, horario y próxima ronda, gasto del mes, envíos pendientes de aprobación y configuración de la secuencia (pasos, plazos).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "ver_envios",
    description: "Mails que el agente mandó o quiere mandar, con su estado. Sirve para '¿qué le mandaste a X?', 'qué quedó pendiente', 'qué falló'.",
    input_schema: {
      type: "object",
      properties: {
        estado: { type: "string", enum: ["PENDING_APPROVAL", "SENT", "DISCARDED", "FAILED"] },
        cliente: { type: "string", description: "Parte del nombre del cliente o empresa" },
        desde: { type: "string", description: "YYYY-MM-DD" },
        hasta: { type: "string", description: "YYYY-MM-DD" },
        cantidad: { type: "integer", description: "Máximo de filas (1-100). Por defecto 30." },
      },
    },
  },
  {
    name: "ver_deudas",
    description: "Deudas actuales que sigue el agente: cliente, venta, monto, vencimiento, días de atraso, en qué paso está y por qué se saltea si se saltea. Calculado en el momento.",
    input_schema: {
      type: "object",
      properties: {
        solo_vencidas: { type: "boolean" },
        cliente: { type: "string", description: "Parte del nombre del cliente o empresa" },
      },
    },
  },
  {
    name: "preparar_recordatorio",
    description: "Prepara un recordatorio de pago para una venta puntual, con la plantilla de recordatorios manuales. NO lo manda: queda como borrador con un botón Enviar que una persona tiene que apretar.",
    input_schema: {
      type: "object",
      properties: { venta: { type: "integer", description: "Número de la venta" } },
      required: ["venta"],
    },
  },
  {
    name: "proponer_aprobacion",
    description: "Muestra un botón para aprobar (mandar) o descartar un grupo de envíos pendientes. Usá ver_envios con estado PENDING_APPROVAL antes para conseguir los ids. NO aprueba nada por sí mismo.",
    input_schema: {
      type: "object",
      properties: {
        operacion: { type: "string", enum: ["approve", "discard"] },
        ids: { type: "array", items: { type: "string" } },
      },
      required: ["operacion", "ids"],
    },
  },
  {
    name: "preparar_reporte",
    description: "Calcula el reporte de cobranzas de un período (avisos, cobrado después de los avisos, deuda vencida hoy) y muestra los botones para descargarlo en PDF/Excel o mandarlo por mail.",
    input_schema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "YYYY-MM-DD" },
        hasta: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["desde", "hasta"],
    },
  },
  {
    name: "proponer_plantilla",
    description: `Propone un texto nuevo para la plantilla de un paso (o 'MANUAL' para los recordatorios pedidos por chat). Muestra un botón Aplicar; no cambia nada por sí mismo. Variables disponibles: ${PLACEHOLDERS.map((p) => `{{${p.key}}}`).join(", ")}.`,
    input_schema: {
      type: "object",
      properties: {
        paso: { type: "string", description: "Clave del paso (PRE, DUE, OVERDUE_1…) o MANUAL" },
        asunto: { type: "string" },
        cuerpo: { type: "string" },
      },
      required: ["paso", "asunto", "cuerpo"],
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: ctx.agentId } });
  const config = readCollectionsConfig(agent.config);

  switch (name) {
    case "ver_estado": {
      const [pendientes, gasto] = await Promise.all([
        prisma.agentAction.count({ where: { agentId: agent.id, status: "PENDING_APPROVAL" } }),
        monthSpendUsd(agent.id),
      ]);
      return {
        estado: agent.status,
        horario: agent.scheduleTime ? `${agent.scheduleTime} (días ${agent.scheduleDays})` : "sin horario, solo manual",
        proxima_ronda: agent.nextRunAt ? `${formatLocalDateTime(agent.nextRunAt)} (hora de Buenos Aires)` : null,
        gasto_mes_usd: Number(gasto.toFixed(4)),
        tope_mes_usd: Number(agent.monthlyBudgetUsd),
        pendientes_de_aprobacion: pendientes,
        plazo_ventas_sin_plan_dias: config.defaultTermDays,
        deja_de_escribir_pasados_dias: config.escalateAfterDays,
        pasos: config.steps.map((s) => ({
          clave: s.key, etiqueta: s.label, dias: s.offsetDays, activo: s.enabled, requiere_aprobacion: s.requiresApproval,
        })),
        clientes_excluidos: config.excludedContactIds.length,
      };
    }

    case "ver_envios": {
      const where: Prisma.AgentActionWhereInput = { agentId: agent.id };
      if (typeof input.estado === "string") where.status = input.estado as Prisma.EnumAgentActionStatusFilter["equals"];
      if (typeof input.cliente === "string" && input.cliente.trim()) where.contactName = { contains: input.cliente.trim() };
      const desde = typeof input.desde === "string" ? new Date(`${input.desde}T00:00:00-03:00`) : null;
      const hasta = typeof input.hasta === "string" ? new Date(`${input.hasta}T23:59:59-03:00`) : null;
      if (desde || hasta) where.createdAt = { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) };
      const acciones = await prisma.agentAction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(100, Math.max(1, Number(input.cantidad) || 30)),
      });
      return acciones.map((a) => ({
        id: a.id,
        creado: formatLocalDateTime(a.createdAt),
        cliente: a.contactName,
        venta: a.saleNumber,
        paso: a.origin === "CHAT" ? "pedido por chat" : a.step,
        monto: a.amount ? Number(a.amount) : null,
        vencimiento: a.dueDate ? formatLocalDate(a.dueDate) : null,
        estado: a.status,
        simulado: a.simulated,
        enviado: a.sentAt ? formatLocalDateTime(a.sentAt) : null,
        asunto: a.subject,
        error: a.error,
      }));
    }

    case "ver_deudas": {
      let deudas = await computeDebts(config);
      if (input.solo_vencidas) deudas = deudas.filter((d) => d.daysPastDue > 0);
      if (typeof input.cliente === "string" && input.cliente.trim()) {
        const q = input.cliente.trim().toLowerCase();
        deudas = deudas.filter((d) => d.contactName.toLowerCase().includes(q));
      }
      return deudas.slice(0, 80).map((d) => ({
        cliente: d.contactName,
        venta: d.saleNumber,
        cuota: d.installmentLabel || null,
        monto: formatAmount(d.amount, d.currency),
        vencimiento: formatLocalDate(d.dueDate),
        dias_de_atraso: d.daysPastDue,
        paso: d.step?.label ?? "todavía no corresponde avisar",
        se_saltea_por: d.skip,
      }));
    }

    case "preparar_recordatorio": {
      const numero = Number(input.venta);
      const deuda = (await computeDebts(config)).find((d) => d.saleNumber === numero);
      if (!deuda) return { error: `La venta #${numero} no tiene saldo pendiente (o no existe, o está anulada/pendiente).` };
      if (!deuda.hasEmail) return { error: "El cliente no tiene email cargado; no se le puede escribir." };
      if (config.excludedContactIds.includes(deuda.contactId)) return { error: "Ese cliente está marcado como 'no contactar'." };
      const { subject, body } = await renderForDebt(deuda, config.manualSubject, config.manualBody, config);
      const accion = await prisma.agentAction.create({
        data: {
          agentId: agent.id,
          origin: "CHAT",
          type: "SEND_EMAIL",
          status: "PENDING_APPROVAL",
          contactId: deuda.contactId,
          contactName: deuda.contactName,
          saleId: deuda.saleId,
          saleNumber: deuda.saleNumber,
          installmentId: deuda.installmentId,
          amount: new Prisma.Decimal(deuda.amount),
          dueDate: deuda.dueDate,
          subject,
          body,
          requestedById: ctx.actor.userId,
        },
        select: { id: true },
      });
      ctx.cards.push({
        type: "action_created",
        actionId: accion.id,
        label: `${deuda.contactName} — venta #${deuda.saleNumber}`,
        subject,
        body,
      });
      return { ok: true, borrador: { asunto: subject }, nota: "Quedó como borrador con un botón Enviar en el chat y en la bandeja de pendientes." };
    }

    case "proponer_aprobacion": {
      const ids = Array.isArray(input.ids) ? (input.ids as unknown[]).filter((x): x is string => typeof x === "string") : [];
      const acciones = await prisma.agentAction.findMany({
        where: { id: { in: ids }, agentId: agent.id, status: "PENDING_APPROVAL" },
        select: { id: true, contactName: true, saleNumber: true },
      });
      if (acciones.length === 0) return { error: "Ninguno de esos ids está pendiente de aprobación." };
      const op = input.operacion === "discard" ? "discard" : "approve";
      ctx.cards.push({
        type: "confirm_actions",
        op,
        actionIds: acciones.map((a) => a.id),
        items: acciones.map((a) => `${a.contactName}${a.saleNumber ? ` — venta #${a.saleNumber}` : ""}`),
      });
      return { ok: true, cantidad: acciones.length, nota: "Se muestra el botón; hace falta que un SUPERADMIN lo apriete." };
    }

    case "preparar_reporte": {
      const desde = new Date(`${String(input.desde)}T00:00:00-03:00`);
      const hasta = new Date(`${String(input.hasta)}T23:59:59-03:00`);
      if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || desde > hasta) {
        return { error: "Fechas inválidas. Usá YYYY-MM-DD y que 'desde' sea anterior a 'hasta'." };
      }
      const r = await buildCollectionsReport(agent.id, desde, hasta);
      ctx.cards.push({ type: "report", from: String(input.desde), to: String(input.hasta) });
      return {
        periodo: `${formatLocalDate(desde)} al ${formatLocalDate(hasta)}`,
        enviados: r.totals.enviados,
        pendientes: r.totals.pendientes,
        descartados: r.totals.descartados,
        fallidos: r.totals.fallidos,
        cobrado_despues_de_un_aviso: montos(r.totals.cobradoDespues),
        ventas_que_pagaron_despues_del_aviso: r.totals.ventasQuePagaron,
        deuda_vencida_hoy: montos(r.deudaHoy.vencidaPorMoneda),
        deudas_vencidas_hoy: r.deudaHoy.deudas,
        para_seguimiento_personal: r.deudaHoy.escaladas,
      };
    }

    case "proponer_plantilla": {
      const paso = String(input.paso ?? "").toUpperCase();
      const step = config.steps.find((s) => s.key === paso);
      if (paso !== "MANUAL" && !step) {
        return { error: `No existe el paso ${paso}. Pasos: ${config.steps.map((s) => s.key).join(", ")}, MANUAL.` };
      }
      ctx.cards.push({
        type: "template",
        stepKey: paso,
        stepLabel: step?.label ?? "Recordatorio manual (chat)",
        subject: String(input.asunto ?? "").slice(0, 200),
        body: String(input.cuerpo ?? "").slice(0, 5000),
      });
      return { ok: true, nota: "Se muestra el botón Aplicar; hace falta que un SUPERADMIN lo apriete." };
    }

    default:
      return NOT_HANDLED;
  }
}

export const collectionsKind: AgentKindImpl = {
  configSchema: collectionsConfigSchema,
  defaultConfig: defaultCollectionsConfig,
  readConfig: readCollectionsConfig,
  hasApprovals: true,
  role: "el agente de cobranzas del CRM de Kristall Film (láminas de polarizado). Trabajás como un empleado más: todos los días revisás quién debe, mandás avisos amables antes del vencimiento y preparás reclamos de pagos vencidos para que un SUPERADMIN los apruebe.",
  rules: [
    "No tenés acceso a emails, teléfonos ni datos personales de los clientes, y no los necesitás: el CRM completa el destinatario al mandar. Si te los piden, explicalo.",
    "Los textos de los mails salen de plantillas. Si te piden cambiar cómo escribís, proponé la plantilla nueva con proponer_plantilla.",
  ],
  tools: TOOLS,
  runTool,
  async run({ agent, runId, now }) {
    const r = await runCollections({ agent, runId, now });
    const notify = [];
    if (r.nuevasPendientes.length > 0) {
      notify.push({
        type: "AGENT_PENDING_APPROVAL",
        title: `${agent.name}: ${r.nuevasPendientes.length} reclamo(s) para aprobar`,
        message: `La ronda dejó ${r.nuevasPendientes.length} reclamo(s) esperando tu aprobación. Se pueden aprobar desde la bandeja del agente o pidiéndoselo en el chat.`,
        link: `/agents/${agent.id}?tab=pending`,
        detail: r.nuevasPendientes.slice(0, 25),
      });
    }
    if (r.stats.fallidas > 0) {
      notify.push({
        type: "AGENT_RUN_PARTIAL",
        title: `${agent.name}: ${r.stats.fallidas} envío(s) fallaron`,
        message: "La ronda terminó, pero algunos mails no salieron. El detalle está en Ejecuciones.",
        link: `/agents/${agent.id}?tab=runs`,
      });
    }
    return {
      status: r.stats.fallidas > 0 ? "PARTIAL" : "SUCCESS",
      stats: r.stats as unknown as Prisma.InputJsonValue,
      summary: r.summary,
      spend: r.spend,
      pendingCount: r.stats.pendientes,
      notify,
    };
  },
};
