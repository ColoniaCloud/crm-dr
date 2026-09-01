import { NextResponse } from "next/server";
import { requirePortalApiKey, requireEnabledPortalAccount } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { findClientContact } from "@/lib/client-portal";
import { getClientAccount } from "@/lib/account";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/account");

/**
 * Estado de cuenta corriente del Cliente: movimientos con saldo corrido, planes
 * de cuotas y resumen.
 *
 * Disponible en el nivel BASIC — es el corazón del "Panel Clientes".
 *
 * Usa el mismo motor (`lib/account.ts`) que la ficha del cliente en el CRM, a
 * propósito: si el operador y el cliente vieran números distintos, el panel
 * dejaría de servir.
 */
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

    return NextResponse.json(await getClientAccount(contactId));
  } catch (error) {
    log.error({ err: error }, "Error fetching client account");
    return NextResponse.json({ error: "Error al cargar la cuenta corriente" }, { status: 500 });
  }
}
