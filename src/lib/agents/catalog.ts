import type { AgentKind } from "@prisma/client";
import { defaultCollectionsConfig } from "@/lib/agents/collections/config";

/**
 * Catálogo de tipos de agente (decisión 3 de AGENTES.md): cada tipo trae sus
 * herramientas programadas, sus parámetros y una descripción de puesto por
 * defecto. Crear un agente es elegir un tipo y ajustarlo, no inventar uno libre.
 *
 * Los que vienen después (remitos sin firmar, reporte semanal, revisor de
 * garantías) se agregan acá y como valor nuevo AL FINAL del enum AgentKind.
 */
export interface AgentKindInfo {
  kind: AgentKind;
  label: string;
  description: string;
  defaultName: string;
  defaultInstructions: string;
  defaultConfig: () => unknown;
  defaultScheduleTime: string;
  defaultScheduleDays: string;
}

export const AGENT_CATALOG: Record<AgentKind, AgentKindInfo> = {
  COLLECTIONS: {
    kind: "COLLECTIONS",
    label: "Cobranzas",
    description:
      "Avisa antes de que venza un pago y prepara los reclamos de pagos vencidos para aprobar. Escribe por email desde gestion@, con plantillas.",
    defaultName: "Cobranzas",
    defaultInstructions:
      "Sos el encargado de cobranzas. Tu prioridad es que los clientes paguen a tiempo sin desgastar la relación: tono cordial y directo, nunca amenazante. Ante la duda, dejá el caso para que lo vea una persona.",
    defaultConfig: defaultCollectionsConfig,
    defaultScheduleTime: "09:00",
    defaultScheduleDays: "1,2,3,4,5",
  },
};

export function kindInfo(kind: AgentKind): AgentKindInfo {
  return AGENT_CATALOG[kind];
}
