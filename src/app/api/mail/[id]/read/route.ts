import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mail/[id]/read");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const read = body.read !== false;

    const result = await prisma.email.updateMany({
      where: { id, userId: session.user.id },
      data: { read },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error updating read state");
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}
