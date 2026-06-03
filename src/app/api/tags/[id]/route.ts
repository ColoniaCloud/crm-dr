import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logOperatorAction } from "@/lib/notifications";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { id } = await params;
    const tag = await prisma.tag.findUnique({ where: { id }, select: { name: true } });
    await prisma.tag.delete({ where: { id } });
    await logOperatorAction({ userId: session.user.id, action: "DELETE_TAG", entityType: "TAG", entityId: id, description: `Eliminó etiqueta "${tag?.name}"` });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error al eliminar etiqueta" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { id } = await params;
    const { name, color } = await request.json();
    const tag = await prisma.tag.update({ where: { id }, data: { name, color } });
    await logOperatorAction({ userId: session.user.id, action: "UPDATE_TAG", entityType: "TAG", entityId: id, description: `Actualizó etiqueta "${tag.name}"` });
    return NextResponse.json(tag);
  } catch {
    return NextResponse.json({ error: "Error al actualizar etiqueta" }, { status: 500 });
  }
}
