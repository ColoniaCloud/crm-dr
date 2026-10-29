import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logOperatorAction } from "@/lib/notifications";
import { isAdminRole } from "@/lib/crm-tasks";

// Renombrar o borrar cambia las tareas de todo el equipo, así que es cosa de
// ADMIN+. Crear y usar etiquetas lo puede hacer cualquiera (ver ../route.ts).

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isAdminRole(session.user.role)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { id } = await params;
  const { name, color } = await request.json();
  const data: { name?: string; color?: string } = {};
  if (typeof name === "string") {
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean || clean.length > 40) return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
    data.name = clean;
  }
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) data.color = color;

  try {
    const tag = await prisma.taskTag.update({ where: { id }, data, select: { id: true, name: true, color: true } });
    await logOperatorAction({ userId: session.user.id, action: "UPDATE_TASK_TAG", entityType: "TASK_TAG", entityId: id, description: `Actualizó etiqueta de tareas "${tag.name}"` });
    return NextResponse.json(tag);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") return NextResponse.json({ error: "Ya existe una etiqueta con ese nombre" }, { status: 409 });
    if (code === "P2025") return NextResponse.json({ error: "Etiqueta inexistente" }, { status: 404 });
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isAdminRole(session.user.role)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { id } = await params;
  const tag = await prisma.taskTag.findUnique({ where: { id }, select: { name: true } });
  if (!tag) return NextResponse.json({ error: "Etiqueta inexistente" }, { status: 404 });

  // Se la saca de todas las tareas (cascade en CrmTaskTag); las tareas quedan.
  await prisma.taskTag.delete({ where: { id } });
  await logOperatorAction({ userId: session.user.id, action: "DELETE_TASK_TAG", entityType: "TASK_TAG", entityId: id, description: `Eliminó etiqueta de tareas "${tag.name}"` });
  return NextResponse.json({ ok: true });
}
