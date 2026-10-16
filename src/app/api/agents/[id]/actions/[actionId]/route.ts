import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canApproveAgentActions } from "@/lib/agents/access";
import { editAction, excludeContact } from "@/lib/agents/actions";
import { forbidden, loadAgentFor, requireActor } from "@/lib/agents/api";

const schema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("edit"), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(5000) }),
  z.object({ op: z.literal("exclude_contact") }),
]);

/** Editar el texto de un pendiente, o marcar a su cliente como "no contactar". Solo SUPERADMIN. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; actionId: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const actor = gate.value;
  if (!canApproveAgentActions(actor.role)) return forbidden("Solo un SUPERADMIN puede modificar envíos.");
  const { id, actionId } = await params;
  const found = await loadAgentFor(actor, id);
  if (!found.ok) return found.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const accion = await prisma.agentAction.findFirst({ where: { id: actionId, agentId: id }, select: { contactId: true } });
  if (!accion) return NextResponse.json({ error: "Envío no encontrado" }, { status: 404 });

  if (parsed.data.op === "edit") {
    const ok = await editAction({
      agentId: id,
      actionId,
      subject: parsed.data.subject,
      body: parsed.data.body,
      userId: actor.userId,
    });
    if (!ok) return NextResponse.json({ error: "Ese envío ya no está pendiente." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  await excludeContact({ agentId: id, contactId: accion.contactId, userId: actor.userId });
  return NextResponse.json({ ok: true });
}

