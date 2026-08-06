import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { transferRollLocation } from "@/lib/warranty";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/warranty-rolls/[code]/transfer");

const transferSchema = z.object({
  toLocationId: z.string().min(1),
  reason: z.string().optional(),
});

// POST /api/warranty-rolls/[code]/transfer — ADMIN+ (mismo criterio que
// Movimientos de Stock). Traslado interno de custodia entre Depósito/Local/
// Punto de Reventa; no es una venta, no toca el estado de garantía. Usa el
// mismo segmento [code] que GET /api/warranty-rolls/[code] — Next.js no
// permite mezclar nombres de slug distintos en el mismo nivel de ruta.
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { code } = await params;
    const body = await request.json();
    const validation = validateBody(transferSchema, body);
    if (!validation.success) return validation.response;
    const { toLocationId, reason } = validation.data;

    const result = await transferRollLocation(code, toLocationId, session.user.id, reason);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await logOperatorAction({
      userId: session.user.id,
      action: "TRANSFER_WARRANTY_ROLL",
      entityType: "WARRANTY_ROLL",
      entityId: code,
      description: `Movió el rollo ${code}${reason ? ` (${reason})` : ""}`,
      link: "/warranty-claims",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error transferring warranty roll");
    return NextResponse.json({ error: "Error al mover el rollo" }, { status: 500 });
  }
}
