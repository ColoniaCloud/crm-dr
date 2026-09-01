import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { validateBody } from "@/lib/api-validation";
import { getWorkOrder, updateWorkOrder } from "@/lib/workshop";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/orders/[orderId]");

type Params = { params: Promise<{ contactId: string; orderId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { contactId, orderId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    const order = await getWorkOrder(gate.contactId, orderId);
    if (!order) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    return NextResponse.json(order);
  } catch (error) {
    log.error({ err: error }, "Error fetching work order");
    return NextResponse.json({ error: "Error al cargar la orden" }, { status: 500 });
  }
}

const itemSchema = z.object({
  description: z.string().trim().min(1).max(191),
  productId: z.string().min(1).nullish(),
  rollId: z.string().min(1).nullish(),
  squareMetersUsed: z.number().nonnegative().max(99999999).nullish(),
  price: z.number().nonnegative().max(99999999).nullish(),
});

/**
 * `status` no está acá a propósito: cambiar de estado va por
 * `POST /transition`, porque entrar en TERMINADA dispara efectos que tienen que
 * ser transaccionales. Un PATCH que pisa la columna los saltearía.
 */
const patchSchema = z
  .object({
    workshopClientId: z.string().min(1),
    assetId: z.string().min(1).nullable(),
    scheduledAt: z.coerce.date().nullable(),
    priceQuoted: z.number().nonnegative().max(99999999).nullable(),
    priceFinal: z.number().nonnegative().max(99999999).nullable(),
    currency: z.enum(["ARS", "USD"]),
    notes: z.string().max(5000).nullable(),
    /** Si viene, REEMPLAZA todas las líneas de la OT. */
    items: z.array(itemSchema).max(50),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "No hay nada que actualizar" });

export async function PATCH(request: Request, { params }: Params) {
  const { contactId, orderId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  if (json && typeof json === "object" && "status" in json) {
    return NextResponse.json(
      { error: "El estado se cambia con POST /transition, no con PATCH" },
      { status: 400 }
    );
  }

  const validation = validateBody(patchSchema, json);
  if (!validation.success) return validation.response;

  try {
    const result = await updateWorkOrder(gate.contactId, orderId, validation.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.order);
  } catch (error) {
    log.error({ err: error }, "Error updating work order");
    return NextResponse.json({ error: "Error al actualizar la orden" }, { status: 500 });
  }
}
