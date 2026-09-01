import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { validateBody } from "@/lib/api-validation";
import { addWorkOrderPayment } from "@/lib/workshop";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/orders/[orderId]/payments");

type Params = { params: Promise<{ contactId: string; orderId: string }> };

const schema = z.object({
  amount: z.number().positive().max(99999999),
  currency: z.enum(["ARS", "USD"]).optional(),
  method: z.string().trim().max(191).nullish(),
  reference: z.string().trim().max(191).nullish(),
  notes: z.string().max(5000).nullish(),
  paidAt: z.coerce.date().optional(),
});

/**
 * Registra lo que el cliente final le pagó AL INSTALADOR.
 *
 * No tiene nada que ver con la cuenta corriente que Kristall le lleva al
 * instalador (sección 4.9): son dos libros distintos que da la casualidad que
 * viven en la misma base. Nada de acá entra en `getClientBalance()`.
 */
export async function POST(request: Request, { params }: Params) {
  const { contactId, orderId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(schema, json);
  if (!validation.success) return validation.response;

  try {
    const result = await addWorkOrderPayment(gate.contactId, orderId, validation.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.payment, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error adding work order payment");
    return NextResponse.json({ error: "Error al registrar el cobro" }, { status: 500 });
  }
}
