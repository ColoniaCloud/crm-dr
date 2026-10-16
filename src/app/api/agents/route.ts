import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { canConfigureAgents } from "@/lib/agents/access";
import { AGENT_CATALOG } from "@/lib/agents/catalog";
import { DEFAULT_AGENT_MODEL, AGENT_MODELS } from "@/lib/agents/models";
import { isValidTime, parseDays } from "@/lib/agents/schedule";
import { forbidden, requireActor, serializeAgent } from "@/lib/agents/api";

const log = createLogger("api/agents");

export async function GET() {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const actor = gate.value;

  try {
    const where: Prisma.AgentWhereInput =
      actor.role === "OPERATOR" ? { operatorCanChat: true } : {};
    const agents = await prisma.agent.findMany({ where, orderBy: { createdAt: "asc" } });
    return NextResponse.json({
      agents: await Promise.all(agents.map((a) => serializeAgent(a, actor))),
      catalog: Object.values(AGENT_CATALOG).map((k) => ({
        kind: k.kind,
        label: k.label,
        description: k.description,
        defaultName: k.defaultName,
        defaultInstructions: k.defaultInstructions,
        defaultScheduleTime: k.defaultScheduleTime,
        defaultScheduleDays: k.defaultScheduleDays,
      })),
      models: Object.entries(AGENT_MODELS).map(([id, m]) => ({ id, label: m.label })),
      canCreate: canConfigureAgents(actor.role),
    });
  } catch (err) {
    log.error({ err }, "Error listando agentes");
    return NextResponse.json({ error: "No se pudieron cargar los agentes" }, { status: 500 });
  }
}

const createSchema = z.object({
  kind: z.enum(["COLLECTIONS"]),
  name: z.string().trim().min(1).max(80),
  instructions: z.string().trim().min(1).max(5000),
  scheduleTime: z.string().refine(isValidTime, "Hora inválida").nullable(),
  scheduleDays: z.string().nullable(),
  model: z.string().refine((m) => m in AGENT_MODELS, "Modelo inválido").default(DEFAULT_AGENT_MODEL),
  monthlyBudgetUsd: z.number().min(0).max(1000),
  operatorCanChat: z.boolean().default(false),
});

export async function POST(req: Request) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const actor = gate.value;
  if (!canConfigureAgents(actor.role)) return forbidden("Solo un SUPERADMIN puede crear agentes.");

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const d = parsed.data;

  try {
    // Nace pausado (decisión: nada sale hasta que alguien lo prende a propósito).
    const agent = await prisma.agent.create({
      data: {
        kind: d.kind,
        name: d.name,
        instructions: d.instructions,
        config: AGENT_CATALOG[d.kind].defaultConfig() as Prisma.InputJsonValue,
        scheduleTime: d.scheduleTime,
        scheduleDays: d.scheduleDays ? parseDays(d.scheduleDays).join(",") : null,
        model: d.model,
        monthlyBudgetUsd: new Prisma.Decimal(d.monthlyBudgetUsd),
        operatorCanChat: d.operatorCanChat,
        createdById: actor.userId,
      },
    });
    await logOperatorAction({
      userId: actor.userId,
      action: "AGENT_CREATED",
      entityType: "Agent",
      entityId: agent.id,
      description: `Creó el agente "${agent.name}" (${AGENT_CATALOG[d.kind].label}).`,
      link: `/agents/${agent.id}`,
    });
    return NextResponse.json({ agent: await serializeAgent(agent, actor) }, { status: 201 });
  } catch (err) {
    log.error({ err }, "Error creando agente");
    return NextResponse.json({ error: "No se pudo crear el agente" }, { status: 500 });
  }
}
