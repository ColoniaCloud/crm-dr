import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalApiKey } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/notifications/[id]/read");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ contactId: string; id: string }> }
) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const rl = rateLimit(`portal-api:${gate.client.id}`, 300, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const { contactId, id } = await params;
    const result = await prisma.portalNotification.updateMany({
      where: { id, contactId },
      data: { read: true },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error marking notification read");
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}
