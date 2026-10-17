import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logOperatorAction } from "@/lib/notifications";
import { canConfigureAgents } from "@/lib/agents/access";
import { kindImpl } from "@/lib/agents/kinds";
import { forbidden, loadAgentFor, requireActor } from "@/lib/agents/api";

const schema = z.object({
  patch: z.record(z.string(), z.unknown()),
  description: z.string().max(300).optional(),
});

/**
 * Aplica un cambio parcial de configuración propuesto por el agente en el chat
 * (tarjeta "Aplicar"). Se mezcla con la configuración actual y se valida con el
 * esquema del tipo: un cambio que deja la configuración inválida no se guarda.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const actor = gate.value;
  if (!canConfigureAgents(actor.role)) return forbidden("Solo un SUPERADMIN puede cambiar la configuración.");
  const { id } = await params;
  const found = await loadAgentFor(actor, id);
  if (!found.ok) return found.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const tipo = kindImpl(found.value.kind);
  const actual = tipo.readConfig(found.value.config) as Record<string, unknown>;
  const nueva = tipo.configSchema.safeParse({ ...actual, ...parsed.data.patch });
  if (!nueva.success) {
    return NextResponse.json({ error: "El cambio deja la configuración inválida; no se aplicó." }, { status: 400 });
  }
  await prisma.agent.update({ where: { id }, data: { config: nueva.data as Prisma.InputJsonValue } });
  await logOperatorAction({
    userId: actor.userId,
    action: "AGENT_CONFIG_PATCHED",
    entityType: "Agent",
    entityId: id,
    description: `Aplicó un cambio propuesto por el agente "${found.value.name}": ${parsed.data.description ?? Object.keys(parsed.data.patch).join(", ")}.`,
    link: `/agents/${id}`,
  });
  return NextResponse.json({ ok: true });
}
