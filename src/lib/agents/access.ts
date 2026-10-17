/**
 * Quién puede hacer qué con un agente (decisión 9 de AGENTES.md).
 *
 * Por rol:
 * - Configurar, crear, aprobar envíos y ejecutar: solo SUPERADMIN.
 * - Chatear: ADMIN y SUPERADMIN siempre; OPERATOR solo si el agente lo permite.
 *
 * Aprobar va con configurar y no con chatear: aprobar es lo que hace salir un
 * mail a un cliente, y "nada sale sin el clic" vale aunque quien pida sea un
 * OPERATOR con permiso de chat.
 *
 * Por dueños: un agente con `visibleToUserIds` es SOLO de esos usuarios, para
 * todo, sin importar el rol. Es lo que permite que el Supervisor del equipo no
 * lo vea un SUPERADMIN al que audita.
 */

type AgentLike = { operatorCanChat: boolean; visibleToUserIds?: unknown };

/** Los dueños del agente, o null si su visibilidad es la normal por rol. */
export function agentOwners(agent: { visibleToUserIds?: unknown }): string[] | null {
  const v = agent.visibleToUserIds;
  if (!Array.isArray(v)) return null;
  const ids = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return ids.length ? ids : null;
}

/** Crear agentes (sin agente todavía): solo SUPERADMIN. */
export function canCreateAgents(role: string | undefined): boolean {
  return role === "SUPERADMIN";
}

export function canConfigureAgents(role: string | undefined, agent?: AgentLike, userId?: string): boolean {
  const owners = agent ? agentOwners(agent) : null;
  if (owners) return Boolean(userId && owners.includes(userId));
  return role === "SUPERADMIN";
}

export function canApproveAgentActions(role: string | undefined, agent?: AgentLike, userId?: string): boolean {
  return canConfigureAgents(role, agent, userId);
}

export function canChatWithAgent(role: string | undefined, agent: AgentLike, userId?: string): boolean {
  const owners = agentOwners(agent);
  if (owners) return Boolean(userId && owners.includes(userId));
  if (role === "SUPERADMIN" || role === "ADMIN") return true;
  return role === "OPERATOR" && agent.operatorCanChat;
}
