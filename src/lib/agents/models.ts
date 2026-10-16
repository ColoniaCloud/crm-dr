import type Anthropic from "@anthropic-ai/sdk";

/**
 * Modelos que se le pueden asignar a un agente, con su precio por millón de
 * tokens. El precio vive acá porque el tope de gasto se controla en el CRM: la
 * API no avisa cuánto lleva gastado un agente, así que cada llamada se cotiza
 * al volver con lo que dice `usage`.
 *
 * Si Anthropic cambia un precio, el tope se desfasa hasta que se actualice esta
 * tabla. Es preferible a consultar el precio en vivo: un tope que depende de una
 * llamada externa deja de ser un tope el día que esa llamada falla.
 */
export const AGENT_MODELS = {
  "claude-haiku-5-5": { label: "Haiku 5.5 — rápido y económico", inputPerM: 0.1, outputPerM: 0.5 },
  "claude-sonnet-5-5": { label: "Sonnet 5.5 — más criterio, para reportes", inputPerM: 2, outputPerM: 10 },
} as const;

export type AgentModelId = keyof typeof AGENT_MODELS;

export const DEFAULT_AGENT_MODEL: AgentModelId = "claude-haiku-5-5";

export function isAgentModel(model: string): model is AgentModelId {
  return model in AGENT_MODELS;
}

export interface Spend {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export const NO_SPEND: Spend = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

/** Costo de una respuesta. Los tokens leídos de caché se cobran como entrada normal: sobreestima un poco, nunca subestima. */
export function spendOf(model: string, usage: Anthropic.Usage): Spend {
  const precio = isAgentModel(model) ? AGENT_MODELS[model] : AGENT_MODELS[DEFAULT_AGENT_MODEL];
  const input =
    usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  const output = usage.output_tokens;
  return {
    inputTokens: input,
    outputTokens: output,
    costUsd: (input * precio.inputPerM + output * precio.outputPerM) / 1_000_000,
  };
}

export function addSpend(a: Spend, b: Spend): Spend {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}
