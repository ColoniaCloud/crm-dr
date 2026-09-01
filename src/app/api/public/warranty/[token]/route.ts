import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { verifyWarranty, pickPublicStatus } from "@/lib/warranty";
import { withCors, corsPreflight } from "@/lib/cors";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

const log = createLogger("api/public/warranty/[token]");

export function OPTIONS() {
  return corsPreflight();
}

// Public, read-only, no API key required — used by the activation page
// before the client fills the form. Deliberately omits personal data
// (clientEmail/clientPhone/clientDni) in case it was activated by someone else.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  // Único endpoint de garantías sin API key, y con CORS abierto: sin límite,
  // alguien podía barrer tokens a ritmo libre. Los tokens nuevos son
  // randomBytes(32) y no se pueden adivinar, pero los cuid ya emitidos sí son
  // secuenciales — el límite es lo que los protege mientras sigan vivos.
  const rl = rateLimit(`warranty-status:${clientIp(_request)}`, 60, 60_000);
  if (!rl.allowed) {
    return withCors(
      NextResponse.json(
        { error: `Demasiadas consultas. Esperá ${rl.retryAfter}s.` },
        { status: 429 }
      )
    );
  }

  try {
    const { token } = await params;
    const warranty = await verifyWarranty(token);
    if (!warranty) {
      return withCors(NextResponse.json({ error: "Garantía no encontrada" }, { status: 404 }));
    }

    // Proyección compartida con POST /api/public/warranty/login — ver
    // pickPublicStatus() en lib/warranty.ts. No inlinear campos acá.
    return withCors(NextResponse.json(pickPublicStatus(warranty)));
  } catch (error) {
    log.error({ err: error }, "Error verifying warranty");
    return withCors(NextResponse.json({ error: "Error al consultar la garantía" }, { status: 500 }));
  }
}
