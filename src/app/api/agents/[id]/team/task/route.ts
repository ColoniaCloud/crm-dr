import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canConfigureAgents } from "@/lib/agents/access";
import { readTeamConfig } from "@/lib/agents/team/config";
import { auditedUsers } from "@/lib/agents/team/metrics";
import { deliverToUser } from "@/lib/agents/team/deliver";
import { formatLocalDate } from "@/lib/agents/schedule";
import { forbidden, loadAgentFor, requireActor } from "@/lib/agents/api";

const schema = z.object({
  userId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().min(1).max(5000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

/**
 * Crea la tarea guiada que propuso el Supervisor (botón "Crear tarea" del chat).
 * Queda asignada por el dueño que apretó el botón, con el instructivo en las
 * notas, y al empleado le llega el aviso.
 */
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
  const d = parsed.data;

  const config = readTeamConfig(found.value.config);
  const empleado = (await auditedUsers(found.value, config)).find((u) => u.id === d.userId);
  if (!empleado) return NextResponse.json({ error: "Esa persona no está entre las auditadas." }, { status: 400 });

  const dueDate = new Date(`${d.dueDate}T18:00:00-03:00`);
  const tarea = await prisma.crmTask.create({
    data: {
      title: d.title,
      dueDate,
      priority: d.priority,
      userId: empleado.id,
      assignedById: actor.userId,
      agentId: found.value.id,
      notes: d.notes,
    },
  });
  await deliverToUser({
    agentId: found.value.id,
    user: empleado,
    type: "GUIDED_TASK",
    subject: `Nueva tarea: ${d.title}`,
    body: `Hola ${empleado.name.split(" ")[0]}:\n\n${actor.name} te asignó una tarea para el ${formatLocalDate(dueDate)}. Te dejo el instructivo:\n\n${d.notes}\n\nCualquier duda, avisale a ${actor.name.split(" ")[0]}.`,
    link: "/assistant",
    channels: config.channels,
    requestedById: actor.userId,
  });
  return NextResponse.json({ ok: true, taskId: tarea.id });
}
