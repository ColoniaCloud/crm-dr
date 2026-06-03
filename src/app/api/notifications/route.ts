import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/notifications");

function isMissingNotificationsTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybePrismaError = error as { code?: string; message?: string };
  return (
    maybePrismaError.code === "P2021" ||
    (typeof maybePrismaError.message === "string" &&
      maybePrismaError.message.toLowerCase().includes("notifications"))
  );
}

// GET /api/notifications — unread + last 24 h for current user
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const notifications = await prisma.notification.findMany({
      where: {
        userId: session.user.id,
        OR: [
          { read: false },
          { createdAt: { gte: since24h } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(notifications);
  } catch (error) {
    if (isMissingNotificationsTable(error)) {
      log.warn("[notifications][GET] notifications table missing, returning empty list");
      return NextResponse.json([]);
    }
    log.error({ err: error }, "[notifications][GET] error");
    return NextResponse.json({ error: "Error al cargar notificaciones" }, { status: 500 });
  }
}

// POST /api/notifications/read-all — mark all as read
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.notification.updateMany({
      where: { userId: session.user.id, read: false },
      data: { read: true },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isMissingNotificationsTable(error)) {
      log.warn("[notifications][POST] notifications table missing, skipping mark-all-read");
      return NextResponse.json({ ok: true });
    }
    log.error({ err: error }, "[notifications][POST] error");
    return NextResponse.json({ error: "Error al marcar notificaciones" }, { status: 500 });
  }
}
