import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logOperatorAction } from "@/lib/notifications";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, avatarUrl: true },
  });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json();
  const { name, email, currentPassword, newPassword, avatarUrl } = body;

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const data: Record<string, unknown> = {};

  if (name) data.name = name.trim();
  if (avatarUrl !== undefined) data.avatarUrl = avatarUrl || null;

  if (email && email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "Ese email ya está en uso" }, { status: 400 });
    data.email = email.trim().toLowerCase();
  }

  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Debes ingresar tu contraseña actual" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 400 });
    data.password = await bcrypt.hash(newPassword, 10);
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { id: true, name: true, email: true, role: true, avatarUrl: true },
  });

  const changes = Object.keys(data).filter(k => k !== "password").join(", ");
  const desc = data.password ? `Actualizó perfil (${changes ? changes + ", " : ""}contraseña)` : `Actualizó perfil (${changes})`;
  await logOperatorAction({ userId: session.user.id, action: "UPDATE_PROFILE", entityType: "USER", entityId: session.user.id, description: desc });
  return NextResponse.json(updated);
}
