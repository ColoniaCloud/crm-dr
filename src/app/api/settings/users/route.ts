import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
const log = createLogger("api/settings/users");

const createUserSchema = z.object({
  name: z.string().min(1, "Nombre es requerido"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  role: z.enum(["SUPERADMIN", "ADMIN", "OPERATOR"]).default("OPERATOR"),
});

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(users);
  } catch (error) {
    log.error({ err: error }, "Unhandled error");
    return NextResponse.json({ error: "Error al obtener usuarios" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await request.json();
    const parsed = validateBody(createUserSchema, body);
    if (!parsed.success) return parsed.response;
    const { name, email: rawEmail, password, role } = parsed.data;
    const email = rawEmail.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role: role || "OPERATOR" },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    await logOperatorAction({ userId: session.user.id, action: "CREATE_USER", entityType: "USER", entityId: user.id, description: `Creó usuario "${name}" (${role || "OPERATOR"})` });
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Unhandled error");
    return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 });
  }
}
