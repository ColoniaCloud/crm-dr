import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/notifications/[id]");

function isMissingNotificationsTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybePrismaError = error as { code?: string; message?: string };
  return (
    maybePrismaError.code === "P2021" ||
    (typeof maybePrismaError.message === "string" &&
      maybePrismaError.message.toLowerCase().includes("notifications"))
  );
}

// PATCH /api/notifications/[id] — mark as read
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await prisma.notification.updateMany({
      where: { id, userId: session.user.id },
      data: { read: true },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isMissingNotificationsTable(error)) {
      log.warn("[notifications][PATCH] notifications table missing, skipping mark-read");
      return NextResponse.json({ ok: true });
    }
    log.error({ err: error }, "[notifications][PATCH] error");
    return NextResponse.json({ error: "Error al marcar notificación" }, { status: 500 });
  }
}
