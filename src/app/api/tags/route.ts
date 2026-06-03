import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
const log = createLogger("api/tags");

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json(tags);
  } catch (error) {
    log.error({ err: error }, "Error fetching tags");
    return NextResponse.json({ error: "Error fetching tags" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { name, color } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
    const tag = await prisma.tag.create({ data: { name: name.trim(), color: color || "#6366f1" } });
    await logOperatorAction({ userId: session.user.id, action: "CREATE_TAG", entityType: "TAG", entityId: tag.id, description: `Creó etiqueta "${name.trim()}"` });
    return NextResponse.json(tag, { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002")
      return NextResponse.json({ error: "Ya existe una etiqueta con ese nombre" }, { status: 409 });
    return NextResponse.json({ error: "Error al crear etiqueta" }, { status: 500 });
  }
}
