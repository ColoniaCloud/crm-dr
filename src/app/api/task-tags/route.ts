import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";

const log = createLogger("api/task-tags");

/** Las etiquetas de tareas de todo el equipo, las más usadas primero. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tags = await prisma.taskTag.findMany({
    select: { id: true, name: true, color: true, _count: { select: { tasks: true } } },
    orderBy: [{ tasks: { _count: "desc" } }, { name: "asc" }],
  });
  return NextResponse.json(tags.map(({ _count, ...t }) => ({ ...t, taskCount: _count.tasks })));
}

/**
 * Crea una etiqueta. Si ya hay una con ese nombre (sin distinguir mayúsculas,
 * por el collation de MySQL) devuelve esa: escribir "cobranza" cuando existe
 * "Cobranza" es querer reutilizarla, no un error.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { name, color } = await request.json();
  const clean = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (!clean) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  if (clean.length > 40) return NextResponse.json({ error: "Máximo 40 caracteres" }, { status: 400 });

  const existing = await prisma.taskTag.findUnique({ where: { name: clean }, select: { id: true, name: true, color: true } });
  if (existing) return NextResponse.json(existing);

  try {
    const tag = await prisma.taskTag.create({
      data: { name: clean, ...(typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? { color } : {}) },
      select: { id: true, name: true, color: true },
    });
    await logOperatorAction({ userId: session.user.id, action: "CREATE_TASK_TAG", entityType: "TASK_TAG", entityId: tag.id, description: `Creó etiqueta de tareas "${tag.name}"` });
    return NextResponse.json(tag, { status: 201 });
  } catch (err) {
    // Dos personas creando la misma a la vez: gana una y la otra la reutiliza.
    if ((err as { code?: string }).code === "P2002") {
      const tag = await prisma.taskTag.findUnique({ where: { name: clean }, select: { id: true, name: true, color: true } });
      if (tag) return NextResponse.json(tag);
    }
    log.error({ err }, "Error creating task tag");
    return NextResponse.json({ error: "No se pudo crear la etiqueta" }, { status: 500 });
  }
}
