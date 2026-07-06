import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { verifyWarranty } from "@/lib/warranty";
import { withCors, corsPreflight } from "@/lib/cors";

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
  try {
    const { token } = await params;
    const warranty = await verifyWarranty(token);
    if (!warranty) {
      return withCors(NextResponse.json({ error: "Garantía no encontrada" }, { status: 404 }));
    }

    return withCors(
      NextResponse.json({
        installationCode: warranty.installationCode,
        status: warranty.status,
        product: warranty.product,
        isActive: warranty.isActive,
        daysRemaining: warranty.daysRemaining,
        expiresAt: warranty.expiresAt,
        assetType: warranty.assetType,
      })
    );
  } catch (error) {
    log.error({ err: error }, "Error verifying warranty");
    return withCors(NextResponse.json({ error: "Error al consultar la garantía" }, { status: 500 }));
  }
}
