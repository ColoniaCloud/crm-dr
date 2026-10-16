import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { anthropic, aiAvailable, modelFor } from "@/lib/agents/llm";
import { addSpend, NO_SPEND, spendOf, type Spend } from "@/lib/agents/models";
import { checkBudgetAfterSpend, hasBudget, monthSpendUsd } from "@/lib/agents/budget";
import { formatLocalDate } from "@/lib/agents/schedule";
import { readCollectionsConfig, PLACEHOLDERS } from "@/lib/agents/collections/config";
import { computeDebts, formatAmount, renderForDebt } from "@/lib/agents/collections/debts";
import { buildCollectionsReport, montos } from "@/lib/agents/collections/report";

const log = createLogger("agents/chat");

/**
 * El chat de un agente: un hilo compartido por todo el equipo (decisión 8).
 *
 * El agente consulta la bitácora y el CRM con herramientas de solo lectura.
 * Todo lo que tiene efecto —mandar, aprobar, descartar, cambiar una plantilla,
 * ejecutar una ronda— lo devuelve como una TARJETA que la pantalla muestra con
 * un botón; el efecto ocurre recién cuando alguien con permiso hace clic, contra
 * su propio endpoint (decisión 7). Las herramientas de acá nunca mandan nada.
 *
 * Ninguna herramienta devuelve emails ni teléfonos (decisión 4): no hay forma de
 * que el modelo los vea, aunque se los pidan.
 */

export type ChatCard =
  | { type: "action_created"; actionId: string; label: string; subject: string; body: string }
  | { type: "confirm_actions"; op: "approve" | "discard"; actionIds: string[]; items: string[] }
  | { type: "report"; from: string; to: string }
  | { type: "template"; stepKey: string; stepLabel: string; subject: string; body: string }
  | { type: "run" }
  | { type: "pending_link"; count: number };

const MAX_TURNS = 6;
const HISTORY = 30;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "ver_estado",
    description: "Estado del agente: activo o pausado, horario y próxima ronda, gasto del mes, envíos pendientes de aprobación y configuración de la secuencia (pasos, plazos).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "ver_ejecuciones",
    description: "Últimas rondas del agente con su resultado, números, resumen y error si lo hubo.",
    input_schema: {
      type: "object",
      properties: { cantidad: { type: "integer", description: "Cuántas rondas (1-20). Por defecto 5." } },
    },
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
  {
    name: "proponer_ejecucion",
    description: "Muestra el botón 'Ejecutar ronda ahora'. No la ejecuta por sí mismo.",
    input_schema: { type: "object", properties: {} },
  },
];

function systemPrompt(agent: { name: string; instructions: string }, actor: { name: string; role: string }): string {
  const hoy = new Date().toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  return `Sos "${agent.name}", el agente de cobranzas del CRM de Kristall Film (láminas de polarizado). Trabajás como un empleado más: todos los días revisás quién debe, mandás avisos amables antes del vencimiento y preparás reclamos de pagos vencidos para que un SUPERADMIN los apruebe.

Instrucciones de tu puesto, escritas por el equipo:
${agent.instructions}

Cómo trabajás en este chat:
- El chat es compartido por el equipo. Cada mensaje de usuario empieza con [nombre]. Hoy es ${hoy}. Te escribe ${actor.name} (${actor.role}).
- Para responder sobre lo que hiciste, usá las herramientas: no inventes números, nombres ni fechas.
- No tenés acceso a emails, teléfonos ni datos personales de los clientes, y no los necesitás: el CRM completa el destinatario al mandar. Si te los piden, explicalo.
- Nunca mandás, aprobás, descartás ni cambiás nada directamente. Las herramientas preparar_* y proponer_* muestran una tarjeta con un botón y una persona decide. Decí claramente que hace falta ese clic. Aprobar envíos y aplicar cambios solo lo puede hacer un SUPERADMIN.
- Los textos de los mails salen de plantillas. Si te piden cambiar cómo escribís, proponé la plantilla nueva con proponer_plantilla.
- Respondé en español rioplatense, breve y concreto. Usá listas cortas cuando enumeres.`;
}

interface Actor {
  userId: string;
  name: string;
  role: string;
}

interface ToolContext {
  agentId: string;
  actor: Actor;
  cards: ChatCard[];
}

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
        proxima_ronda: agent.nextRunAt ? agent.nextRunAt.toISOString() : null,
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

    case "ver_ejecuciones": {
      const n = Math.min(20, Math.max(1, Number(input.cantidad) || 5));
      const runs = await prisma.agentRun.findMany({
        where: { agentId: agent.id },
        orderBy: { startedAt: "desc" },
        take: n,
      });
      return runs.map((r) => ({
        fecha: r.startedAt.toISOString(),
        disparo: r.trigger,
        estado: r.status,
        numeros: r.stats,
        resumen: r.summary,
        error: r.error,
      }));
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
        creado: a.createdAt.toISOString(),
        cliente: a.contactName,
        venta: a.saleNumber,
        paso: a.origin === "CHAT" ? "pedido por chat" : a.step,
        monto: a.amount ? Number(a.amount) : null,
        vencimiento: a.dueDate ? formatLocalDate(a.dueDate) : null,
        estado: a.status,
        simulado: a.simulated,
        enviado: a.sentAt?.toISOString() ?? null,
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

    case "proponer_ejecucion": {
      ctx.cards.push({ type: "run" });
      return { ok: true, nota: "Se muestra el botón; hace falta que un SUPERADMIN lo apriete." };
    }

    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}

async function historyFor(agentId: string): Promise<Anthropic.MessageParam[]> {
  const ultimos = await prisma.agentMessage.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: HISTORY,
  });
  const mensajes: Anthropic.MessageParam[] = [];
  for (const m of ultimos.reverse()) {
    const texto = m.role === "USER" ? `[${m.userName ?? "Usuario"}] ${m.content}` : m.content;
    const role = m.role === "USER" ? "user" : "assistant";
    const previo = mensajes[mensajes.length - 1];
    // Mensajes seguidos del mismo rol (dos partes de ronda, dos personas que
    // escriben seguido) se juntan en un solo turno.
    if (previo && previo.role === role && typeof previo.content === "string") {
      previo.content = `${previo.content}\n\n${texto}`;
    } else {
      mensajes.push({ role, content: texto });
    }
  }
  // La conversación tiene que empezar con un turno de usuario.
  while (mensajes.length && mensajes[0].role !== "user") mensajes.shift();
  return mensajes;
}

export async function chatWithAgent(params: {
  agentId: string;
  actor: Actor;
  message: string;
}): Promise<{ id: string; content: string; attachments: ChatCard[] }> {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: params.agentId } });

  await prisma.agentMessage.create({
    data: {
      agentId: agent.id,
      role: "USER",
      userId: params.actor.userId,
      userName: params.actor.name,
      content: params.message,
    },
  });

  const guardar = async (content: string, attachments: ChatCard[], spend: Spend) => {
    const m = await prisma.agentMessage.create({
      data: {
        agentId: agent.id,
        role: "ASSISTANT",
        content,
        attachments: attachments.length ? (attachments as unknown as Prisma.InputJsonValue) : undefined,
        inputTokens: spend.inputTokens,
        outputTokens: spend.outputTokens,
        costUsd: new Prisma.Decimal(spend.costUsd.toFixed(6)),
      },
      select: { id: true },
    });
    if (spend.costUsd > 0) await checkBudgetAfterSpend(agent.id);
    return { id: m.id, content, attachments };
  };

  if (!aiAvailable()) return guardar("No puedo responder: falta configurar ANTHROPIC_API_KEY en el servidor.", [], NO_SPEND);
  if (!(await hasBudget(agent.id))) {
    return guardar(
      "Estoy pausado porque llegué al tope de gasto del mes. Un SUPERADMIN puede subirlo desde la configuración; si no, vuelvo el mes que viene.",
      [],
      NO_SPEND
    );
  }

  const model = modelFor(agent);
  const ctx: ToolContext = { agentId: agent.id, actor: params.actor, cards: [] };
  const messages = await historyFor(agent.id);
  let spend = NO_SPEND;

  try {
    for (let turno = 0; turno < MAX_TURNS; turno++) {
      const res = await anthropic().messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt(agent, params.actor),
        tools: TOOLS,
        messages,
      });
      spend = addSpend(spend, spendOf(model, res.usage));

      if (res.stop_reason === "refusal") {
        return guardar("No puedo ayudar con ese pedido.", ctx.cards, spend);
      }

      const usos = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const texto = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      if (res.stop_reason !== "tool_use" || usos.length === 0) {
        return guardar(texto || "Listo.", ctx.cards, spend);
      }

      messages.push({ role: "assistant", content: res.content });
      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const uso of usos) {
        try {
          const salida = await runTool(uso.name, (uso.input ?? {}) as Record<string, unknown>, ctx);
          resultados.push({ type: "tool_result", tool_use_id: uso.id, content: JSON.stringify(salida) });
        } catch (err) {
          log.error({ err, tool: uso.name }, "Falló una herramienta del agente");
          resultados.push({
            type: "tool_result",
            tool_use_id: uso.id,
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: resultados });
    }
    return guardar("Me quedé sin pasos para terminar de responder. ¿Podés acotar la pregunta?", ctx.cards, spend);
  } catch (err) {
    log.error({ err, agentId: agent.id }, "Falló el chat del agente");
    return guardar(
      `Tuve un problema para responder (${err instanceof Error ? err.message : "error desconocido"}). Probá de nuevo en un rato.`,
      ctx.cards,
      spend
    );
  }
}
