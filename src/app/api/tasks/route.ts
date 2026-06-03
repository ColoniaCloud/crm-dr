import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logOperatorAction } from "@/lib/notifications";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tasks = await prisma.crmTask.findMany({
    where: { userId: session.user.id },
    orderBy: [{ done: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(tasks);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { title, dueDate, priority } = await request.json();
  if (!title?.trim()) return NextResponse.json({ error: "Título requerido" }, { status: 400 });

  const task = await prisma.crmTask.create({
    data: {
      title: title.trim(),
      dueDate: dueDate ? new Date(dueDate) : null,
      priority: priority || null,
      userId: session.user.id,
    },
  });
  await logOperatorAction({ userId: session.user.id, action: "CREATE_TASK", entityType: "TASK", entityId: task.id, description: `Creó tarea "${title.trim()}"` });
  return NextResponse.json(task, { status: 201 });
}
