import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logOperatorAction } from "@/lib/notifications";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const task = await prisma.crmTask.update({
    where: { id },
    data: body,
  });
  const desc = body.done !== undefined ? (body.done ? "Completó" : "Reabrió") : "Actualizó";
  await logOperatorAction({ userId: session.user.id, action: "UPDATE_TASK", entityType: "TASK", entityId: id, description: `${desc} tarea "${task.title}"` });
  return NextResponse.json(task);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const task = await prisma.crmTask.findUnique({ where: { id }, select: { title: true } });
  await prisma.crmTask.delete({ where: { id } });
  await logOperatorAction({ userId: session.user.id, action: "DELETE_TASK", entityType: "TASK", entityId: id, description: `Eliminó tarea "${task?.title}"` });
  return NextResponse.json({ ok: true });
}
