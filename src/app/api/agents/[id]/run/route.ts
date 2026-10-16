import { NextResponse } from "next/server";
import { logOperatorAction } from "@/lib/notifications";
import { canConfigureAgents } from "@/lib/agents/access";
import { runAgent } from "@/lib/agents/runner";
import { forbidden, loadAgentFor, requireActor } from "@/lib/agents/api";

/**
 * "Ejecutar ahora". Corre aunque el agente esté pausado: es la forma de probar
 * una configuración antes de prenderlo. Los reclamos que requieren aprobación
 * quedan igual en la bandeja.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const actor = gate.value;
  if (!canConfigureAgents(actor.role)) return forbidden("Solo un SUPERADMIN puede ejecutar una ronda.");
  const { id } = await params;
  const found = await loadAgentFor(actor, id);
  if (!found.ok) return found.response;

  const r = await runAgent({ agentId: id, trigger: "MANUAL", userId: actor.userId });
  if (!r.ok) {
    return NextResponse.json(
      { error: r.reason === "BUSY" ? "Ya hay una ronda en curso." : "Agente no encontrado" },
      { status: r.reason === "BUSY" ? 409 : 404 }
    );
  }
  await logOperatorAction({
    userId: actor.userId,
    action: "AGENT_RUN_MANUAL",
    entityType: "Agent",
    entityId: id,
    description: `Ejecutó a mano una ronda del agente "${found.value.name}".`,
    link: `/agents/${id}`,
  });
  return NextResponse.json(r);
}
