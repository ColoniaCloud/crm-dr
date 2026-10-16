import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_AGENT_MODEL, isAgentModel, spendOf, type Spend } from "@/lib/agents/models";

/** Cliente compartido de los agentes. Sin clave, `aiAvailable()` da false y el agente trabaja sin IA. */
let client: Anthropic | null = null;

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function modelFor(agent: { model: string }): string {
  return isAgentModel(agent.model) ? agent.model : DEFAULT_AGENT_MODEL;
}

/** Una sola llamada sin herramientas, para resúmenes. Devuelve el texto y lo que costó. */
export async function complete(params: {
  model: string;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<{ text: string; spend: Spend }> {
  const res = await anthropic().messages.create({
    model: params.model,
    max_tokens: params.maxTokens ?? 2048,
    system: params.system,
    messages: [{ role: "user", content: params.prompt }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { text, spend: spendOf(params.model, res.usage) };
}
