import type Anthropic from "@anthropic-ai/sdk";
import { Prisma, type AgentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { anthropic, aiAvailable, modelFor } from "@/lib/agents/llm";
import { addSpend, NO_SPEND, spendOf, type Spend } from "@/lib/agents/models";
import { checkBudgetAfterSpend, hasBudget } from "@/lib/agents/budget";
import { formatLocalDateTime } from "@/lib/agents/schedule";
import { kindImpl } from "@/lib/agents/kinds";
import { NOT_HANDLED, type Actor, type ChatCard, type ToolContext } from "@/lib/agents/kinds/types";

export type { ChatCard } from "@/lib/agents/kinds/types";

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

const MAX_TURNS = 6;
const HISTORY = 30;

/** Herramientas que tienen todos los agentes. Cada tipo suma las suyas. */
const COMMON_TOOLS: Anthropic.Tool[] = [
  {
    name: "ver_ejecuciones",
    description: "Últimas rondas del agente con su resultado, números, resumen y error si lo hubo.",
    input_schema: {
      type: "object",
      properties: { cantidad: { type: "integer", description: "Cuántas rondas (1-20). Por defecto 5." } },
    },
  },
  {
    name: "proponer_ejecucion",
    description: "Muestra el botón 'Ejecutar ronda ahora'. No la ejecuta por sí mismo.",
    input_schema: { type: "object", properties: {} },
  },
];

function systemPrompt(
  agent: { name: string; instructions: string; kind: AgentKind },
  actor: Actor
): string {
  const hoy = new Date().toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const tipo = kindImpl(agent.kind);
  const reglas = [
    `El chat es compartido por el equipo. Cada mensaje de usuario empieza con [nombre]. Hoy es ${hoy}. Te escribe ${actor.name} (${actor.role}).`,
    "Para responder sobre lo que hiciste, usá las herramientas: no inventes números, nombres ni fechas.",
    "Nunca mandás, aprobás, descartás ni cambiás nada directamente. Las herramientas preparar_* y proponer_* muestran una tarjeta con un botón y una persona decide. Decí claramente que hace falta ese clic. Aprobar envíos y aplicar cambios solo lo puede hacer un SUPERADMIN.",
    ...tipo.rules,
    "Respondé en español rioplatense, breve y concreto. Usá listas cortas cuando enumeres. No nombres tus herramientas: hablá de lo que hacés, no de cómo se llama la función.",
  ];
  return `Sos "${agent.name}", ${tipo.role}

Instrucciones de tu puesto, escritas por el equipo:
${agent.instructions}

Cómo trabajás en este chat:
${reglas.map((r) => `- ${r}`).join("\n")}`;
}

async function runTool(
  kind: AgentKind,
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  switch (name) {
    case "ver_ejecuciones": {
      const n = Math.min(20, Math.max(1, Number(input.cantidad) || 5));
      const runs = await prisma.agentRun.findMany({
        where: { agentId: ctx.agentId },
        orderBy: { startedAt: "desc" },
        take: n,
      });
      return runs.map((r) => ({
        fecha: `${formatLocalDateTime(r.startedAt)} (hora de Buenos Aires)`,
        disparo: r.trigger,
        estado: r.status,
        numeros: r.stats,
        resumen: r.summary,
        error: r.error,
      }));
    }
    case "proponer_ejecucion": {
      ctx.cards.push({ type: "run" });
      return { ok: true, nota: "Se muestra el botón; hace falta que un SUPERADMIN lo apriete." };
    }
  }
  const salida = await kindImpl(kind).runTool(name, input, ctx);
  return salida === NOT_HANDLED ? { error: `Herramienta desconocida: ${name}` } : salida;
}

async function historyFor(agentId: string): Promise<Anthropic.MessageParam[]> {
  const ultimos = await prisma.agentMessage.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: HISTORY,
  });
  const mensajes: Anthropic.MessageParam[] = [];
  for (const m of ultimos.reverse()) {
    // Sin el rastro, en el turno siguiente el modelo ve una respuesta con datos
    // y ninguna consulta detrás, y concluye que se los inventó.
    const traza = ((m.attachments as ChatCard[] | null) ?? []).find((c) => c.type === "trace");
    const consultas = traza && traza.type === "trace" && traza.calls.length ? `(Consultas que hice: ${traza.calls.join(" · ")})\n` : "";
    const texto = m.role === "USER" ? `[${m.userName ?? "Usuario"}] ${m.content}` : `${consultas}${m.content}`;
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
  const calls: string[] = [];
  const conTraza = () => (calls.length ? [...ctx.cards, { type: "trace" as const, calls }] : ctx.cards);
  const messages = await historyFor(agent.id);
  let spend = NO_SPEND;

  try {
    for (let turno = 0; turno < MAX_TURNS; turno++) {
      const res = await anthropic().messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt(agent, params.actor),
        tools: [...COMMON_TOOLS, ...kindImpl(agent.kind).tools],
        messages,
      });
      spend = addSpend(spend, spendOf(model, res.usage));

      if (res.stop_reason === "refusal") {
        return guardar("No puedo ayudar con ese pedido.", conTraza(), spend);
      }

      const usos = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const texto = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      if (res.stop_reason !== "tool_use" || usos.length === 0) {
        return guardar(texto || "Listo.", conTraza(), spend);
      }

      messages.push({ role: "assistant", content: res.content });
      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const uso of usos) {
        try {
          const salida = await runTool(agent.kind, uso.name, (uso.input ?? {}) as Record<string, unknown>, ctx);
          const json = JSON.stringify(salida);
          calls.push(`${uso.name}(${JSON.stringify(uso.input ?? {})}) → ${json.length > 240 ? `${json.slice(0, 240)}…` : json}`);
          resultados.push({ type: "tool_result", tool_use_id: uso.id, content: json });
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
    return guardar("Me quedé sin pasos para terminar de responder. ¿Podés acotar la pregunta?", conTraza(), spend);
  } catch (err) {
    log.error({ err, agentId: agent.id }, "Falló el chat del agente");
    return guardar(
      `Tuve un problema para responder (${err instanceof Error ? err.message : "error desconocido"}). Probá de nuevo en un rato.`,
      conTraza(),
      spend
    );
  }
}
