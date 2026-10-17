import { NextResponse } from "next/server";
import { z } from "zod";
import { canConfigureAgents } from "@/lib/agents/access";
import { readTeamConfig } from "@/lib/agents/team/config";
import { auditedUsers } from "@/lib/agents/team/metrics";
import { deliverToUser } from "@/lib/agents/team/deliver";
import { forbidden, loadAgentFor, requireActor } from "@/lib/agents/api";

const schema = z.object({
  userId: z.string().min(1),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
});

/** Manda el mensaje puntual que propuso el Supervisor (botón "Enviar" del chat). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const actor = gate.value;
  const { id } = await params;
  const found = await loadAgentFor(actor, id);
  if (!found.ok) return found.response;
  if (found.value.kind !== "TEAM_SUPERVISOR" || !canConfigureAgents(actor.role, found.value, actor.userId)) {
    return forbidden();
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const config = readTeamConfig(found.value.config);
  const empleado = (await auditedUsers(found.value, config)).find((u) => u.id === parsed.data.userId);
  if (!empleado) return NextResponse.json({ error: "Esa persona no está entre las auditadas." }, { status: 400 });

  const ok = await deliverToUser({
    agentId: found.value.id,
    user: empleado,
    type: "MESSAGE",
    subject: parsed.data.subject,
    body: parsed.data.body,
    link: "/assistant",
    channels: config.channels,
    requestedById: actor.userId,
  });
  if (!ok) return NextResponse.json({ error: "No se pudo mandar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
