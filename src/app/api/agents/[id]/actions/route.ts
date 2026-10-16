import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canApproveAgentActions } from "@/lib/agents/access";
import { approveActions, discardActions } from "@/lib/agents/actions";
import { forbidden, loadAgentFor, requireActor } from "@/lib/agents/api";

const STATUSES = ["PENDING_APPROVAL", "SENT", "DISCARDED", "FAILED"] as const;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const found = await loadAgentFor(gate.value, id);
  if (!found.ok) return found.response;

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const take = Math.min(200, Math.max(1, Number(sp.get("take")) || 100));
  const acciones = await prisma.agentAction.findMany({
    where: {
      agentId: id,
      ...(status && (STATUSES as readonly string[]).includes(status) ? { status: status as (typeof STATUSES)[number] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });
  return NextResponse.json({
    actions: acciones.map((a) => ({
      id: a.id,
      origin: a.origin,
      status: a.status,
      contactId: a.contactId,
      contactName: a.contactName,
      saleId: a.saleId,
      saleNumber: a.saleNumber,
      step: a.step,
      amount: a.amount ? Number(a.amount) : null,
      dueDate: a.dueDate?.toISOString() ?? null,
      subject: a.subject,
      body: a.body,
      simulated: a.simulated,
      error: a.error,
      createdAt: a.createdAt.toISOString(),
      sentAt: a.sentAt?.toISOString() ?? null,
      // Reclamada por un envío en curso: no se puede editar ni volver a aprobar.
      inFlight: a.status === "PENDING_APPROVAL" && a.approvedAt !== null,
    })),
  });
}

const bulkSchema = z.object({
  op: z.enum(["approve", "discard"]),
  ids: z.array(z.string()).min(1).max(200),
});

/** Aprobar (mandar) o descartar varios pendientes. Solo SUPERADMIN. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const actor = gate.value;
  if (!canApproveAgentActions(actor.role)) return forbidden("Solo un SUPERADMIN puede aprobar o descartar envíos.");
  const { id } = await params;
  const found = await loadAgentFor(actor, id);
  if (!found.ok) return found.response;

  const parsed = bulkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  if (parsed.data.op === "discard") {
    const count = await discardActions({ agentId: id, actionIds: parsed.data.ids, userId: actor.userId });
    return NextResponse.json({ discarded: count });
  }
  const result = await approveActions({ agentId: id, actionIds: parsed.data.ids, userId: actor.userId });
  return NextResponse.json({ result });
}
