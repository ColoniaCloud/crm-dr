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
 * Al pasar a `TERMINADA` la respuesta trae además `efectos`, con las garantías
 * que se activaron, los rollos que no pudieron generar una, y si se le mandó el
 * mail al cliente final. El resto de las transiciones no lo traen.
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
    // `efectos` va al lado de la orden, no adentro: la orden es el recurso y
    // los efectos son lo que pasó en ESTA llamada. Meterlos dentro haría que
    // parezcan parte del estado de la orden y que el consumidor los espere en
    // cada GET.
    return NextResponse.json(
      result.efectos ? { ...result.order, efectos: result.efectos } : result.order
    );
  } catch (error) {
    log.error({ err: error }, "Error transitioning work order");
    return NextResponse.json({ error: "Error al cambiar el estado" }, { status: 500 });
  }
}
