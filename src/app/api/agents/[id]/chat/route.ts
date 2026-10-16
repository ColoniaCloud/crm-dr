import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { chatWithAgent } from "@/lib/agents/chat";
import { loadAgentFor, requireActor } from "@/lib/agents/api";

const log = createLogger("api/agents/chat");

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const found = await loadAgentFor(gate.value, id);
  if (!found.ok) return found.response;

  const take = Math.min(200, Math.max(1, Number(new URL(req.url).searchParams.get("take")) || 80));
  const mensajes = await prisma.agentMessage.findMany({
    where: { agentId: id },
    orderBy: { createdAt: "desc" },
    take,
  });
  return NextResponse.json({
    messages: mensajes.reverse().map((m) => ({
      id: m.id,
      role: m.role,
      userName: m.userName,
      content: m.content,
      attachments: m.attachments,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

const schema = z.object({ message: z.string().trim().min(1).max(4000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const found = await loadAgentFor(gate.value, id);
  if (!found.ok) return found.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mensaje vacío o demasiado largo" }, { status: 400 });

  try {
    const reply = await chatWithAgent({ agentId: id, actor: gate.value, message: parsed.data.message });
    return NextResponse.json({ reply });
  } catch (err) {
    log.error({ err }, "Error en el chat del agente");
    return NextResponse.json({ error: "El agente no pudo responder" }, { status: 500 });
  }
}
