import { NextResponse } from "next/server";
import { requirePortalApiKey, requireInstallerLevel } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { findClientContact } from "@/lib/client-portal";
import { createAdditionalInstallation } from "@/lib/warranty";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/rolls/[fullRollCode]/installations");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ contactId: string; fullRollCode: string }> }
) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const rl = rateLimit(`portal-api:${gate.client.id}`, 300, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const { contactId, fullRollCode } = await params;
    const contact = await findClientContact(contactId);
    if (!contact) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const level = await requireInstallerLevel(contactId, request);
    if (!level.success) return level.response;

    const result = await createAdditionalInstallation(contactId, fullRollCode);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ...result.installation, rollStatus: result.rollStatus }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating additional installation");
    return NextResponse.json({ error: "Error al generar la instalación" }, { status: 500 });
  }
}
