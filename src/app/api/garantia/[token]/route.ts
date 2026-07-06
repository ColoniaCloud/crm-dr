import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { verifyWarranty } from "@/lib/warranty";

const log = createLogger("api/garantia/[token]");

// First-party endpoint for our own /garantia pages — same-origin only,
// no API key needed. External partners use /api/public/warranty/[token] instead.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const warranty = await verifyWarranty(token);
    if (!warranty) {
      return NextResponse.json({ error: "Garantía no encontrada" }, { status: 404 });
    }
    return NextResponse.json(warranty);
  } catch (error) {
    log.error({ err: error }, "Error verifying warranty");
    return NextResponse.json({ error: "Error al consultar la garantía" }, { status: 500 });
  }
}
