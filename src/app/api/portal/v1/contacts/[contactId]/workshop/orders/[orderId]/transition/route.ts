import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { validateBody } from "@/lib/api-validation";
import { transitionWorkOrder } from "@/lib/workshop";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/orders/[orderId]/transition");

type Params = { params: Promise<{ contactId: string; orderId: string }> };

const schema = z.object({
  to: z.enum(["PRESUPUESTADA", "AGENDADA", "EN_PROCESO", "TERMINADA", "ENTREGADA", "CANCELADA"]),
  /** Atajo para cerrar el precio en el mismo movimiento que se termina la OT. */
  priceFinal: z.number().nonnegative().max(99999999).nullish(),
});

/**
 * Cambia el estado de una OT. Es su propio endpoint —y no un campo del PATCH—
 * porque entrar en TERMINADA dispara efectos: descontar los m² del rollo,
 * generar la garantía y mandarle el mail al cliente final. Eso tiene que ser
 * una operación con nombre propio y transaccional, no un `status: "TERMINADA"`
 * suelto en un body.
 *
 * **Fase 2: la máquina de estados y los timestamps están; los efectos de
 * TERMINADA son la Fase 4.** Hoy la transición valida y sella la fecha, pero
 * todavía no toca el material ni la garantía — el punto exacto donde va está
 * marcado en `transitionWorkOrder` (src/lib/workshop.ts).
 */
export async function POST(request: Request, { params }: Params) {
  const { contactId, orderId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(schema, json);
  if (!validation.success) return validation.response;

  try {
    const result = await transitionWorkOrder(gate.contactId, orderId, validation.data.to, {
      priceFinal: validation.data.priceFinal,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.order);
  } catch (error) {
    log.error({ err: error }, "Error transitioning work order");
    return NextResponse.json({ error: "Error al cambiar el estado" }, { status: 500 });
  }
}
