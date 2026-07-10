import { NextResponse } from "next/server";
import { requirePortalApiKey } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { lookupClientByEmail } from "@/lib/client-portal";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/lookup");

export async function GET(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const rl = rateLimit(`portal-api:${gate.client.id}`, 300, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email")?.trim();
    if (!email) {
      return NextResponse.json({ error: "El parámetro email es requerido" }, { status: 400 });
    }

    const matches = await lookupClientByEmail(email);
    if (matches.length === 0) {
      return NextResponse.json({ error: "No se encontró un cliente con ese email" }, { status: 404 });
    }
    if (matches.length > 1) {
      return NextResponse.json(
        { error: "Hay más de un cliente con ese email, no se puede resolver de forma única" },
        { status: 409 }
      );
    }

    const [contact] = matches;
    return NextResponse.json({
      contactId: contact.id,
      name: `${contact.firstName} ${contact.lastName}`,
      company: contact.company,
    });
  } catch (error) {
    log.error({ err: error }, "Error looking up client");
    return NextResponse.json({ error: "Error al buscar el cliente" }, { status: 500 });
  }
}
