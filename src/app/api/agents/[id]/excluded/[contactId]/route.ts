import { NextResponse } from "next/server";
import { canApproveAgentActions } from "@/lib/agents/access";
import { includeContact } from "@/lib/agents/actions";
import { forbidden, loadAgentFor, requireActor } from "@/lib/agents/api";

/** Vuelve a incluir en las rondas a un cliente marcado como "no contactar". */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const { id, contactId } = await params;
  const found = await loadAgentFor(gate.value, id);
  if (!found.ok) return found.response;
  if (!canApproveAgentActions(gate.value.role, found.value, gate.value.userId)) return forbidden();
  await includeContact({ agentId: id, contactId });
  return NextResponse.json({ ok: true });
}
