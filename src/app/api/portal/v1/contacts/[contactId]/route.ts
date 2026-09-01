import { NextResponse } from "next/server";
import { requirePortalApiKey, requireEnabledPortalAccount } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getClientProfile } from "@/lib/client-portal";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]");

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

    // Antes de armar el perfil: si la cuenta está deshabilitada no hay nada
    // que devolver, y el perfil es la consulta más cara de la API.
    const active = await requireEnabledPortalAccount(contactId);
    if (!active.success) return active.response;

    const profile = await getClientProfile(contactId);
    if (!profile) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch (error) {
    log.error({ err: error }, "Error fetching client profile");
    return NextResponse.json({ error: "Error al cargar el cliente" }, { status: 500 });
  }
}
