import { NextResponse } from "next/server";
import { requirePortalApiKey, requireInstallerLevel } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { findClientContact, getClientInstallations } from "@/lib/client-portal";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/installations");

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

    const level = await requireInstallerLevel(contactId, request);
    if (!level.success) return level.response;

    const installations = await getClientInstallations(contactId);
    return NextResponse.json(installations);
  } catch (error) {
    log.error({ err: error }, "Error fetching client installations");
    return NextResponse.json({ error: "Error al cargar las instalaciones" }, { status: 500 });
  }
}
