import type { AgentKind } from "@prisma/client";
import { collectionsKind } from "@/lib/agents/collections/kind";
import { prioritizerKind } from "@/lib/agents/leads/prioritizer/kind";
import type { AgentKindImpl } from "@/lib/agents/kinds/types";

/** Registro de tipos de agente: cada valor de `AgentKind` tiene su implementación. */
const KINDS: Record<AgentKind, AgentKindImpl> = {
  COLLECTIONS: collectionsKind,
  LEAD_PRIORITIZER: prioritizerKind,
};

export function kindImpl(kind: AgentKind): AgentKindImpl {
  return KINDS[kind];
}
