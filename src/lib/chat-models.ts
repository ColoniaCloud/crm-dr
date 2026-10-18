/**
 * Modelos que el usuario puede elegir en el chat del asistente y de los agentes.
 * Vive aparte de `agents/models.ts` porque lo importa el navegador (el selector)
 * y el servidor (la validación): nada de acá puede tocar Prisma ni el SDK.
 *
 * El precio por millón de tokens se usa para cotizar el gasto de los agentes
 * cuando la conversación corre con un modelo distinto al configurado.
 */
export const CHAT_MODELS = [
  { id: "claude-sonnet-5-5", name: "Sonnet 5.5", description: "Ideal para tareas complejas", inputPerM: 2, outputPerM: 10 },
  { id: "claude-haiku-5-5", name: "Haiku 5.5", description: "Por defecto, el más equilibrado", inputPerM: 0.1, outputPerM: 0.5 },
  { id: "claude-haiku-4-5-20251001", name: "Haiku 4.5", description: "El más económico, ideal para búsquedas internas", inputPerM: 1, outputPerM: 5 },
] as const;

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];

export const DEFAULT_CHAT_MODEL: ChatModelId = "claude-haiku-5-5";

export function isChatModel(model: unknown): model is ChatModelId {
  return typeof model === "string" && CHAT_MODELS.some((m) => m.id === model);
}
