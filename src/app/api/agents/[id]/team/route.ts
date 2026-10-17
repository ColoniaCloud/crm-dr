import { NextResponse } from "next/server";
import { readTeamConfig } from "@/lib/agents/team/config";
import { teamMetrics } from "@/lib/agents/team/metrics";
import { loadAgentFor, requireActor } from "@/lib/agents/api";

/** Métricas del equipo para el panel del Supervisor: `?days=7`. Solo sus dueños llegan acá. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const found = await loadAgentFor(gate.value, id);
  if (!found.ok) return found.response;
  if (found.value.kind !== "TEAM_SUPERVISOR") return NextResponse.json({ people: [] });

  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 7));
  const now = new Date();
  const people = await teamMetrics(
    found.value,
    readTeamConfig(found.value.config),
    new Date(now.getTime() - days * 86_400_000),
    now,
    now
  );
  return NextResponse.json({ days, people });
}
