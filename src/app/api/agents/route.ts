import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { logAgentAudit } from "@/lib/agents/notify";
import { canChatWithAgent, canCreateAgents } from "@/lib/agents/access";
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
    // Se filtra en código y no en la consulta: los agentes con dueños se ven
    // solo para ellos, sin importar el rol, y eso vive en canChatWithAgent.
    const agents = (await prisma.agent.findMany({ orderBy: { createdAt: "asc" } })).filter((a) =>
      canChatWithAgent(actor.role, a, actor.userId)
    );
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
        restricted: Boolean(k.restricted),
      })),
      models: Object.entries(AGENT_MODELS).map(([id, m]) => ({ id, label: m.label })),
      canCreate: canCreateAgents(actor.role),
      // Para elegir dueños al crear un agente restringido.
      users: canCreateAgents(actor.role)
        ? await prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } })
        : [],
    });
  } catch (err) {
    log.error({ err }, "Error listando agentes");
    return NextResponse.json({ error: "No se pudieron cargar los agentes" }, { status: 500 });
  }
}

const createSchema = z.object({
  kind: z.enum(["COLLECTIONS", "LEAD_PRIORITIZER", "TEAM_SUPERVISOR"]),
  name: z.string().trim().min(1).max(80),
  instructions: z.string().trim().min(1).max(5000),
  scheduleTime: z.string().refine(isValidTime, "Hora inválida").nullable(),
  scheduleDays: z.string().nullable(),
  model: z.string().refine((m) => m in AGENT_MODELS, "Modelo inválido").default(DEFAULT_AGENT_MODEL),
  monthlyBudgetUsd: z.number().min(0).max(1000),
  operatorCanChat: z.boolean().default(false),
  /** Dueños: solo ellos lo ven. Obligatorio en los tipos restringidos. */
  visibleToUserIds: z.array(z.string()).max(20).optional(),
});

export async function POST(req: Request) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const actor = gate.value;
  if (!canCreateAgents(actor.role)) return forbidden("Solo un SUPERADMIN puede crear agentes.");

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const d = parsed.data;

  // Dueños: quien lo crea siempre queda incluido, y tienen que ser usuarios activos.
  let duenos: string[] | null = null;
  if (AGENT_CATALOG[d.kind].restricted || d.visibleToUserIds?.length) {
    const pedidos = [...new Set([...(d.visibleToUserIds ?? []), actor.userId])];
    const existen = await prisma.user.findMany({ where: { id: { in: pedidos }, deletedAt: null }, select: { id: true } });
    duenos = existen.map((u) => u.id);
  }

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
        operatorCanChat: duenos ? false : d.operatorCanChat,
        visibleToUserIds: duenos ?? undefined,
        createdById: actor.userId,
      },
    });
    await logAgentAudit({
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
