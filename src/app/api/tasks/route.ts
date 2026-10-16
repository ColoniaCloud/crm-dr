import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { createTask, isAdminRole, TaskError, toTaskDTOs } from "@/lib/crm-tasks";

const log = createLogger("api/tasks");

/**
 * GET /api/tasks             → mis tareas (sigue devolviendo un array, lo usa el dashboard)
 * GET /api/tasks?scope=team  → las de todo el equipo (solo ADMIN+), con `userId` opcional para filtrar
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const filterUser = url.searchParams.get("userId");

  let where: Record<string, unknown> = { userId: session.user.id };
  if (scope === "team") {
    if (!isAdminRole(session.user.role)) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }
    where = filterUser ? { userId: filterUser } : {};
  }

  const tasks = await prisma.crmTask.findMany({
    where,
    orderBy: [{ done: "asc" }, { createdAt: "desc" }],
    take: scope === "team" ? 200 : undefined,
  });
  return NextResponse.json(await toTaskDTOs(tasks));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { title, dueDate, priority, assigneeId, contactId } = await request.json();
  if (!title?.trim()) return NextResponse.json({ error: "Título requerido" }, { status: 400 });

  try {
    const task = await createTask({
      actor: { userId: session.user.id, role: session.user.role, name: session.user.name },
      title,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority,
      assigneeId,
      contactId,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    if (err instanceof TaskError) return NextResponse.json({ error: err.message }, { status: err.status });
    log.error({ err }, "Error creating task");
    return NextResponse.json({ error: "No se pudo crear la tarea" }, { status: 500 });
  }
}
