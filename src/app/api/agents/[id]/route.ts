import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { canConfigureAgents } from "@/lib/agents/access";
import { AGENT_MODELS } from "@/lib/agents/models";
import { isValidTime, nextRunAfter, parseDays } from "@/lib/agents/schedule";
import { PLACEHOLDERS, readCollectionsConfig } from "@/lib/agents/collections/config";
import { kindImpl } from "@/lib/agents/kinds";
import { ZONE_OPTIONS } from "@/lib/agents/leads/geo";
import { SECTOR_LABELS } from "@/lib/agents/leads/prioritizer/config";
import { displayName } from "@/lib/agents/collections/debts";
import { agentMailMode } from "@/lib/agents/mail";
import { forbidden, loadAgentFor, requireActor, serializeAgent } from "@/lib/agents/api";

const log = createLogger("api/agents/id");

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const found = await loadAgentFor(gate.value, id);
  if (!found.ok) return found.response;

  const agent = await serializeAgent(found.value, gate.value);
  let excludedContacts: Array<{ id: string; name: string }> = [];
  let users: Array<{ id: string; name: string; role: string }> = [];
  if (canConfigureAgents(gate.value.role) && found.value.kind === "LEAD_PRIORITIZER") {
    users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
  }
  if (canConfigureAgents(gate.value.role) && found.value.kind === "COLLECTIONS") {
    const ids = readCollectionsConfig(found.value.config).excludedContactIds;
    const contactos = ids.length
      ? await prisma.contact.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, company: true } })
      : [];
    excludedContacts = contactos.map((c) => ({ id: c.id, name: displayName(c) }));
  }
  return NextResponse.json({
    agent,
    excludedContacts,
    mailMode: agentMailMode(),
    placeholders: PLACEHOLDERS,
    users,
    zones: ZONE_OPTIONS,
    sectors: Object.entries(SECTOR_LABELS).map(([key, label]) => ({ key, label })),
    models: Object.entries(AGENT_MODELS).map(([mid, m]) => ({ id: mid, label: m.label })),
  });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  instructions: z.string().trim().min(1).max(5000).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  scheduleTime: z.string().refine(isValidTime, "Hora inválida").nullable().optional(),
  scheduleDays: z.string().nullable().optional(),
  model: z.string().refine((m) => m in AGENT_MODELS, "Modelo inválido").optional(),
  monthlyBudgetUsd: z.number().min(0).max(1000).optional(),
  operatorCanChat: z.boolean().optional(),
  config: z.unknown().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const actor = gate.value;
  if (!canConfigureAgents(actor.role)) return forbidden("Solo un SUPERADMIN puede configurar agentes.");
  const { id } = await params;
  const found = await loadAgentFor(actor, id);
  if (!found.ok) return found.response;
  const actual = found.value;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue ? `${issue.path.join(".") || "dato"}: ${issue.message}` : "Datos inválidos" },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const data: Prisma.AgentUpdateInput = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.instructions !== undefined) data.instructions = d.instructions;
  if (d.model !== undefined) data.model = d.model;
  if (d.operatorCanChat !== undefined) data.operatorCanChat = d.operatorCanChat;
  if (d.monthlyBudgetUsd !== undefined) data.monthlyBudgetUsd = new Prisma.Decimal(d.monthlyBudgetUsd);
  if (d.config !== undefined) {
    // Cada tipo valida su propia configuración.
    const cfg = kindImpl(actual.kind).configSchema.safeParse(d.config);
    if (!cfg.success) {
      const issue = cfg.error.issues[0];
      return NextResponse.json(
        { error: `config.${issue?.path.join(".") ?? ""}: ${issue?.message ?? "inválida"}` },
        { status: 400 }
      );
    }
    data.config = cfg.data as Prisma.InputJsonValue;
  }
  if (d.status !== undefined) data.status = d.status;

  const scheduleTime = d.scheduleTime !== undefined ? d.scheduleTime : actual.scheduleTime;
  const scheduleDays =
    d.scheduleDays !== undefined ? (d.scheduleDays ? parseDays(d.scheduleDays).join(",") || null : null) : actual.scheduleDays;
  if (d.scheduleTime !== undefined) data.scheduleTime = scheduleTime;
  if (d.scheduleDays !== undefined) data.scheduleDays = scheduleDays;

  // La próxima ronda se recalcula si cambió el horario o si se prendió el agente.
  // Al prenderlo NO corre en el acto: arranca en su próximo horario.
  if (d.scheduleTime !== undefined || d.scheduleDays !== undefined || (d.status === "ACTIVE" && actual.status !== "ACTIVE")) {
    data.nextRunAt = nextRunAfter(scheduleTime, scheduleDays);
  }

  try {
    const agent = await prisma.agent.update({ where: { id }, data });
    const cambios = Object.keys(d).join(", ");
    await logOperatorAction({
      userId: actor.userId,
      action: d.status === "ACTIVE" ? "AGENT_ACTIVATED" : d.status === "PAUSED" ? "AGENT_PAUSED" : "AGENT_UPDATED",
      entityType: "Agent",
      entityId: id,
      description: `Modificó el agente "${agent.name}" (${cambios}).`,
      link: `/agents/${id}`,
    });
    return NextResponse.json({ agent: await serializeAgent(agent, actor) });
  } catch (err) {
    log.error({ err }, "Error actualizando agente");
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}
