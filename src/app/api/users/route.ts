import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/users");

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(role ? { role: role as "ADMIN" | "OPERATOR" } : {}),
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(users);
  } catch (error) {
    log.error({ err: error }, "Error fetching users");
    return NextResponse.json({ error: "Error fetching users" }, { status: 500 });
  }
}
