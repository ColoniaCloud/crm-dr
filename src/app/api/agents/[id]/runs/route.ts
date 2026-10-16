import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadAgentFor, requireActor } from "@/lib/agents/api";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const found = await loadAgentFor(gate.value, id);
  if (!found.ok) return found.response;

  const take = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get("take")) || 30));
  const runs = await prisma.agentRun.findMany({
    where: { agentId: id },
    orderBy: { startedAt: "desc" },
    take,
  });
  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      summary: r.summary,
      error: r.error,
      stats: r.stats,
      costUsd: Number(r.costUsd),
    })),
  });
}
