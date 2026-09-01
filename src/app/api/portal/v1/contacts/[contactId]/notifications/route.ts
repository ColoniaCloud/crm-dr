import { NextResponse } from "next/server";
import { requirePortalApiKey, requireEnabledPortalAccount } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { findClientContact, getClientNotifications } from "@/lib/client-portal";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/notifications");

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

    const active = await requireEnabledPortalAccount(contactId);
    if (!active.success) return active.response;

    const notifications = await getClientNotifications(contactId);
    return NextResponse.json(notifications);
  } catch (error) {
    log.error({ err: error }, "Error fetching client notifications");
    return NextResponse.json({ error: "Error al cargar las notificaciones" }, { status: 500 });
  }
}
