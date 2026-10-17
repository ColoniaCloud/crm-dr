import type { AgentKind } from "@prisma/client";
import { defaultCollectionsConfig } from "@/lib/agents/collections/config";
import { defaultPrioritizerConfig } from "@/lib/agents/leads/prioritizer/config";
import { defaultTeamConfig } from "@/lib/agents/team/config";

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
  /** Se crea con dueños: solo esos usuarios lo ven, sin importar el rol. */
  restricted?: boolean;
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
  LEAD_PRIORITIZER: {
    kind: "LEAD_PRIORITIZER",
    label: "Priorizador de leads",
    description:
      "Cada mañana ordena los leads sin contactar por sector y zona, reparte los que no tienen vendedor y le arma a cada uno su lista del día como tareas, con por qué y qué decirle. No le escribe a ningún lead.",
    defaultName: "Priorizador",
    defaultInstructions:
      "Sos el encargado de que cada vendedor arranque el día sabiendo a quién llamar. Priorizá talleres y concesionarias con volumen, en la zona de cada vendedor. En el \"qué decirle\", sé concreto para el rubro: un taller piensa en margen y en garantía, una concesionaria en volumen y entrega, una vidriería en obra y certificaciones.",
    defaultConfig: defaultPrioritizerConfig,
    defaultScheduleTime: "08:30",
    defaultScheduleDays: "1,2,3,4,5",
  },
  TEAM_SUPERVISOR: {
    kind: "TEAM_SUPERVISOR",
    label: "Supervisor del equipo",
    description:
      "Audita a los usuarios (tareas, leads, actividad y respuesta a mails), les recuerda sus tareas con amabilidad y los guía con tareas que le encargás por el chat. Solo lo ven los dueños que elijas.",
    defaultName: "Supervisor",
    defaultInstructions:
      "Sos el supervisor del equipo. Con los empleados, siempre cálido y respetuoso: recordás, no retás. Con nosotros, directo y con números. Antes de armar una tarea para alguien, preguntá todo lo que necesites para que quede perfectamente clara.",
    defaultConfig: defaultTeamConfig,
    defaultScheduleTime: "09:00",
    defaultScheduleDays: "1,2,3,4,5",
    restricted: true,
  },
};

export function kindInfo(kind: AgentKind): AgentKindInfo {
  return AGENT_CATALOG[kind];
}
