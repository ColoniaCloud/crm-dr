import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";

const log = createLogger("api/warranty-api-clients/[id]");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { active } = await request.json();

    const client = await prisma.warrantyApiClient.update({
      where: { id },
      data: { active: Boolean(active) },
      select: { id: true, name: true, active: true },
    });

    await logOperatorAction({
      userId: session.user.id,
      action: active ? "ACTIVATE_WARRANTY_API_CLIENT" : "REVOKE_WARRANTY_API_CLIENT",
      entityType: "WARRANTY_API_CLIENT",
      entityId: id,
      description: `${active ? "Reactivó" : "Revocó"} la API key de "${client.name}"`,
    });

    return NextResponse.json(client);
  } catch (error) {
    log.error({ err: error }, "Error updating warranty api client");
    return NextResponse.json({ error: "Error al actualizar el cliente de API" }, { status: 500 });
  }
}
