import { NextResponse } from "next/server";
import { requirePortalApiKey, requireNivel } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { findClientContact, getClientStock, getResellerStock } from "@/lib/client-portal";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/stock");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const rl = rateLimit(`portal-api:${gate.client.id}`, 300, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const { contactId } = await params;
    const contact = await findClientContact(contactId);
    if (!contact) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    // Stock lo ven los dos niveles que tienen rollos en la mano. Es el caso que
    // obligó a que el portero reciba una lista y no un nivel mínimo: RESELLER no
    // está por encima ni por debajo de INSTALLER.
    const level = await requireNivel(contactId, request, ["INSTALLER", "RESELLER"]);
    if (!level.success) return level.response;

    // El revendedor recibe además el link de garantía de cada rollo, porque no
    // instala: es lo único que le puede entregar a quien se lo compre. El
    // instalador no lo necesita —genera sus propios sub-códigos— y dárselo
    // ampliaría sin motivo la superficie de un token que es capacidad al
    // portador. Ver getResellerStock().
    const account = await prisma.clientPortalAccount.findUnique({
      where: { contactId },
      select: { accessLevel: true },
    });
    const rolls =
      account?.accessLevel === "RESELLER"
        ? await getResellerStock(contactId)
        : await getClientStock(contactId);
    return NextResponse.json(rolls);
  } catch (error) {
    log.error({ err: error }, "Error fetching client stock");
    return NextResponse.json({ error: "Error al cargar el stock" }, { status: 500 });
  }
}
