import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
const log = createLogger("api/settings/users/[id]");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, string> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (typeof body.email === "string" && body.email.trim()) {
      data.email = body.email.trim();
    }
    if (body.role === "SUPERADMIN" || body.role === "ADMIN" || body.role === "OPERATOR") {
      data.role = body.role;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id, deletedAt: null },
      data,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    log.info({ userId: id, fields: Object.keys(data) }, "User updated by admin");
    await logOperatorAction({ userId: session.user.id, action: "UPDATE_USER", entityType: "USER", entityId: id, description: `Actualizó usuario "${updated.name}" (${Object.keys(data).join(", ")})` });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    log.error({ err: error }, "Error updating user");
    if (error && typeof error === "object" && "code" in error) {
      const prismaError = error as { code: string };
      if (prismaError.code === "P2002") {
        return NextResponse.json(
          { error: "Ya existe un usuario con ese email" },
          { status: 409 }
        );
      }
      if (prismaError.code === "P2025") {
        return NextResponse.json(
          { error: "Usuario no encontrado" },
          { status: 404 }
        );
      }
    }
    return NextResponse.json(
      { error: "Error al actualizar usuario" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;

    if (id === session.user.id) {
      return NextResponse.json(
        { error: "No podés eliminar tu propio usuario" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id }, select: { name: true } });
    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logOperatorAction({ userId: session.user.id, action: "DELETE_USER", entityType: "USER", entityId: id, description: `Eliminó usuario "${user?.name}"` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error deleting user");
    return NextResponse.json(
      { error: "Error al eliminar usuario" },
      { status: 500 }
    );
  }
}
