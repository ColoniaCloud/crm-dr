import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logOperatorAction } from "@/lib/notifications";
import { canManageTask, isAdminRole, setTaskTags, toTaskDTOs } from "@/lib/crm-tasks";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.crmTask.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Tarea inexistente" }, { status: 404 });

  const actor = { userId: session.user.id, role: session.user.role };
  if (!canManageTask(existing, actor)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  // Solo estos campos se pueden tocar: antes el body iba directo a Prisma.
  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (typeof body.done === "boolean") {
    data.done = body.done;
    // Cuándo se cerró: lo usa el Supervisor del equipo para medir cuánto tarda cada uno.
    if (body.done !== existing.done) data.doneAt = body.done ? new Date() : null;
  }
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.priority !== undefined) {
    data.priority = ["LOW", "MEDIUM", "HIGH"].includes(body.priority) ? body.priority : null;
  }
  // Reasignar es cosa de ADMIN+ (igual que asignar al crear).
  if (typeof body.userId === "string" && body.userId !== existing.userId) {
    if (!isAdminRole(actor.role)) return NextResponse.json({ error: "Sin permisos para reasignar" }, { status: 403 });
    data.userId = body.userId;
    data.assignedById = body.userId === actor.userId ? null : actor.userId;
  }

  const task = await prisma.crmTask.update({ where: { id }, data });
  if (body.tagIds !== undefined) await setTaskTags(id, body.tagIds);
  const desc = body.done !== undefined ? (body.done ? "Completó" : "Reabrió") : "Actualizó";
  await logOperatorAction({ userId: session.user.id, action: "UPDATE_TASK", entityType: "TASK", entityId: id, description: `${desc} tarea "${task.title}"` });
  const [dto] = await toTaskDTOs([task]);
  return NextResponse.json(dto);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const task = await prisma.crmTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Tarea inexistente" }, { status: 404 });
  if (!canManageTask(task, { userId: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  await prisma.crmTask.delete({ where: { id } });
  await logOperatorAction({ userId: session.user.id, action: "DELETE_TASK", entityType: "TASK", entityId: id, description: `Eliminó tarea "${task.title}"` });
  return NextResponse.json({ ok: true });
}
