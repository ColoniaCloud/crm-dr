import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { createInvite, serializeInvite } from "@/lib/distributor-invite";
import { normalizeWhatsappNumber } from "@/lib/whatsapp/phone";

const log = createLogger("api/distributor-invites");

/** Invitaciones a /distribuidores-peru. Solo SUPERADMIN: es un envío real a un tercero. */

const createSchema = z.object({
  name: z.string().trim().min(2, "Falta el nombre").max(120),
  business: z.string().trim().min(2, "Falta el taller o negocio").max(160),
  phone: z.string().trim().min(6, "Falta el teléfono").max(40),
  /** Para los números sin código de país. Con "+" o "00" se ignora. */
  country: z.enum(["PE", "AR", "UY"]).default("PE"),
  email: z.string().trim().toLowerCase().email("El mail no es válido").max(200),
});

export async function GET() {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  try {
    const invites = await prisma.distributorInvite.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { createdBy: { select: { name: true } } },
    });
    return NextResponse.json({ invites: invites.map(serializeInvite) });
  } catch (error) {
    log.error({ err: error }, "Error listando invitaciones");
    return NextResponse.json({ error: "No se pudieron cargar las invitaciones" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const json = await request.json().catch(() => null);
  const validation = validateBody(createSchema, json);
  if (!validation.success) return validation.response;
  const { name, business, phone, country, email } = validation.data;

  const digits = normalizeWhatsappNumber(phone, country);
  if (digits.length < 10 || digits.length > 15) {
    return NextResponse.json(
      { error: "El teléfono no es válido. Si no es de Perú, Argentina o Uruguay, escríbalo con +código de país." },
      { status: 400 }
    );
  }

  try {
    const invite = await createInvite({ name, business, phone: digits, email, createdById: session.user.id });
    await logOperatorAction({
      userId: session.user.id,
      action: "DISTRIBUTOR_INVITE_CREATED",
      entityType: "DistributorInvite",
      entityId: invite.id,
      description: `Invitación a /distribuidores-peru para ${name} (${business})`,
    });
    return NextResponse.json({ invite: serializeInvite(invite) }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creando la invitación");
    return NextResponse.json({ error: "No se pudo crear la invitación" }, { status: 500 });
  }
}
