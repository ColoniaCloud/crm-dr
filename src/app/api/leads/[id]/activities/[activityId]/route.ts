import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";

const log = createLogger("api/leads/[id]/activities/[activityId]");

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; activityId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Solo superadmin puede eliminar actividades" }, { status: 403 });
  }

  try {
    const { id, activityId } = await params;

    // Verify the activity belongs to this lead
    const activity = await prisma.leadActivity.findFirst({
      where: { id: activityId, contactId: id },
    });

    if (!activity) {
      return NextResponse.json({ error: "Actividad no encontrada" }, { status: 404 });
    }

    await prisma.leadActivity.delete({ where: { id: activityId } });

    await logOperatorAction({ userId: session.user.id, action: "DELETE_LEAD_ACTIVITY", entityType: "LEAD_ACTIVITY", entityId: activityId, description: `Eliminó actividad "${activity.type}" del lead`, link: `/leads/${id}` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error deleting lead activity");
    return NextResponse.json(
      { error: "Error al eliminar actividad" },
      { status: 500 }
    );
  }
}
