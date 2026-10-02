import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { verifyWarranty, pickOwnStatus } from "@/lib/warranty";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

const log = createLogger("api/garantia/[token]");

// First-party endpoint for our own /garantia pages. "Same-origin" no es una
// protección real acá: es una ruta HTTP común, alcanzable igual por curl o por
// cualquier script externo. Antes devolvía el objeto completo de
// verifyWarranty() — clientEmail/clientPhone/clientDni y el propio
// activationToken en texto plano, sin límite de consultas — lo que permitía
// barrer los tokens cuid viejos (secuenciales, adivinables) y exfiltrar PII en
// masa. Ahora usa la misma proyección y el mismo límite que la versión pública.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = rateLimit(`garantia-status:${clientIp(request)}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Demasiadas consultas. Esperá ${rl.retryAfter}s.` },
      { status: 429 }
    );
  }

  try {
    const { token } = await params;
    const warranty = await verifyWarranty(token);
    if (!warranty) {
      return NextResponse.json({ error: "Garantía no encontrada" }, { status: 404 });
    }
    return NextResponse.json(pickOwnStatus(warranty));
  } catch (error) {
    log.error({ err: error }, "Error verifying warranty");
    return NextResponse.json({ error: "Error al consultar la garantía" }, { status: 500 });
  }
}
