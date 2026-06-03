import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateLeadSummary } from "@/lib/ai";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/leads/[id]/ai-summary");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "API key de IA no configurada" },
      { status: 503 }
    );
  }

  try {
    const { id } = await params;

    const activities = await prisma.leadActivity.findMany({
      where: { contactId: id },
      include: {
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    if (activities.length === 0) {
      return NextResponse.json({ summary: "No hay actividad registrada para generar un resumen." });
    }

    const activitiesText = activities
      .map((a) => `[${new Date(a.createdAt).toLocaleString("es-AR")}] ${a.user.name} — ${a.type}: ${a.title}${a.description ? ` | ${a.description}` : ""}`)
      .join("\n");

    const summary = await generateLeadSummary(activitiesText);

    return NextResponse.json({ summary });
  } catch (error) {
    log.error({ err: error }, "Error generating lead AI summary");
    return NextResponse.json(
      { error: "Error al generar resumen" },
      { status: 500 }
    );
  }
}
