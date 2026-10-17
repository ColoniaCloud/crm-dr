import type Anthropic from "@anthropic-ai/sdk";
import type { Agent, Prisma } from "@prisma/client";
import type { ZodType } from "zod";
import type { Spend } from "@/lib/agents/models";

/**
 * Lo que tiene que traer cada tipo de agente para enchufarse a la base común
 * (ronda, bitácora, chat, tope de gasto). La base no sabe nada de cobranzas ni
 * de leads: le pide al tipo que trabaje y anota lo que pasó.
 */

export type ChatCard =
  | { type: "action_created"; actionId: string; label: string; subject: string; body: string }
  | { type: "confirm_actions"; op: "approve" | "discard"; actionIds: string[]; items: string[] }
  | { type: "report"; from: string; to: string }
  | { type: "template"; stepKey: string; stepLabel: string; subject: string; body: string }
  | { type: "run" }
  | { type: "pending_link"; count: number }
  /** Cambio de configuración propuesto por el agente: se aplica con un botón (PATCH parcial). */
  | { type: "config_patch"; description: string; patch: Record<string, unknown> }
  /** Rastro de las consultas que hizo el agente. No se dibuja: vuelve en el historial. */
  | { type: "trace"; calls: string[] };

export interface Actor {
  userId: string;
  name: string;
  role: string;
}

export interface ToolContext {
  agentId: string;
  actor: Actor;
  cards: ChatCard[];
}

/** Lo que devuelve `runTool` cuando la herramienta no es de este tipo. */
export const NOT_HANDLED = Symbol("not-handled");

export interface AgentNotice {
  type: string;
  title: string;
  message: string;
  link: string;
  detail?: string[];
}

export interface KindRunResult {
  status: "SUCCESS" | "PARTIAL";
  stats: Prisma.InputJsonValue;
  summary: string;
  spend: Spend;
  /** Cuántas acciones quedaron esperando aprobación (para la tarjeta del chat). */
  pendingCount: number;
  /** Avisos para los SUPERADMIN al terminar la ronda. */
  notify: AgentNotice[];
}

export interface AgentKindImpl {
  configSchema: ZodType;
  defaultConfig: () => unknown;
  readConfig: (raw: unknown) => unknown;
  /** Si el tipo genera acciones para aprobar (bandeja de Pendientes). */
  hasApprovals: boolean;
  /** Primera frase del system prompt: quién es y qué hace. */
  role: string;
  /** Reglas propias del tipo, además de las comunes. */
  rules: string[];
  tools: Anthropic.Tool[];
  runTool: (name: string, input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
  run: (params: { agent: Agent; runId: string; now: Date }) => Promise<KindRunResult>;
}
