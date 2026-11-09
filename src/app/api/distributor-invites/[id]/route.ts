import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { sendInvite, serializeInvite } from "@/lib/distributor-invite";

const log = createLogger("api/distributor-invites/[id]");

const schema = z.discriminatedUnion("action", [
  /** Vuelve a mandar el link, por uno o por los dos canales. */
  z.object({ action: z.literal("resend"), channels: z.array(z.enum(["whatsapp", "email"])).min(1).default(["whatsapp", "email"]) }),
  /** Desactiva el link: la página pasa a mostrar que ya no está disponible. */
  z.object({ action: z.literal("revoke") }),
  /** Reactiva un link revocado. */
  z.object({ action: z.literal("restore") }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const json = await request.json().catch(() => null);
  const validation = validateBody(schema, json);
  if (!validation.success) return validation.response;
  const body = validation.data;

  const { id } = await params;
  try {
    const invite = await prisma.distributorInvite.findUnique({ where: { id } });
    if (!invite) return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 });

    let updated;
    if (body.action === "resend") {
      if (invite.revokedAt) {
        return NextResponse.json({ error: "La invitación está revocada. Reactívela antes de reenviar." }, { status: 409 });
      }
      updated = await sendInvite(invite, body.channels, session.user.id);
    } else {
      updated = await prisma.distributorInvite.update({
        where: { id },
        data: { revokedAt: body.action === "revoke" ? new Date() : null },
      });
    }

    await logOperatorAction({
      userId: session.user.id,
      action: `DISTRIBUTOR_INVITE_${body.action.toUpperCase()}`,
      entityType: "DistributorInvite",
      entityId: id,
      description: `Invitación de ${invite.name} (${invite.business}): ${body.action}`,
    });
    return NextResponse.json({ invite: serializeInvite(updated) });
  } catch (error) {
    log.error({ err: error }, "Error actualizando la invitación");
    return NextResponse.json({ error: "No se pudo actualizar la invitación" }, { status: 500 });
  }
}
