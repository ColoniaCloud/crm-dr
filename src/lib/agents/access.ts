/**
 * Quién puede hacer qué con un agente (decisión 9 de AGENTES.md).
 *
 * - Configurar, crear, aprobar envíos y ejecutar: solo SUPERADMIN.
 * - Chatear: ADMIN y SUPERADMIN siempre; OPERATOR solo si el agente lo permite.
 *
 * Aprobar va con configurar y no con chatear: aprobar es lo que hace salir un
 * mail a un cliente, y "nada sale sin el clic" vale aunque quien pida sea un
 * OPERATOR con permiso de chat.
 */
export function canConfigureAgents(role: string | undefined): boolean {
  return role === "SUPERADMIN";
}

export function canApproveAgentActions(role: string | undefined): boolean {
  return role === "SUPERADMIN";
}

export function canChatWithAgent(role: string | undefined, agent: { operatorCanChat: boolean }): boolean {
  if (role === "SUPERADMIN" || role === "ADMIN") return true;
  return role === "OPERATOR" && agent.operatorCanChat;
}
