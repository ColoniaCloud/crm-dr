import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAgentAudit } from "@/lib/agents/notify";
import { canConfigureAgents } from "@/lib/agents/access";
import { readCollectionsConfig } from "@/lib/agents/collections/config";
import { forbidden, loadAgentFor, requireActor } from "@/lib/agents/api";

const schema = z.object({
  stepKey: z.string().min(1).max(20),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});

/** Aplica una plantilla propuesta por el agente en el chat (botón "Aplicar"). Solo SUPERADMIN. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const actor = gate.value;
  const { id } = await params;
  const found = await loadAgentFor(actor, id);
  if (!found.ok) return found.response;
  if (!canConfigureAgents(actor.role, found.value, actor.userId)) return forbidden("Solo un SUPERADMIN puede cambiar plantillas.");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { stepKey, subject, body } = parsed.data;

  const config = readCollectionsConfig(found.value.config);
  if (stepKey === "MANUAL") {
    config.manualSubject = subject;
    config.manualBody = body;
  } else {
    const step = config.steps.find((s) => s.key === stepKey);
    if (!step) return NextResponse.json({ error: "Ese paso no existe" }, { status: 404 });
    step.subject = subject;
    step.body = body;
  }
  await prisma.agent.update({ where: { id }, data: { config: config as unknown as Prisma.InputJsonValue } });
  await logAgentAudit({
    userId: actor.userId,
    action: "AGENT_TEMPLATE_UPDATED",
    entityType: "Agent",
    entityId: id,
    description: `Cambió la plantilla ${stepKey} del agente "${found.value.name}".`,
    link: `/agents/${id}`,
  });
  return NextResponse.json({ ok: true });
}
