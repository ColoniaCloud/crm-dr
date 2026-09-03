import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { updateWorkshopService, deactivateWorkshopService } from "@/lib/workshop";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/services/[serviceId]");

type Params = { params: Promise<{ contactId: string; serviceId: string }> };

const schema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).nullable(),
    priceFrom: z.number().positive().nullable(),
    currency: z.enum(["ARS", "USD"]),
    durationMinutes: z.number().int().min(15).max(480),
    active: z.boolean(),
    sortOrder: z.number().int().min(0),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "No hay nada que actualizar" });

export async function PATCH(request: Request, { params }: Params) {
  const { contactId, serviceId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(schema, json);
  if (!validation.success) return validation.response;

  try {
    const ok = await updateWorkshopService(gate.contactId, serviceId, validation.data);
    // 404 y no 403: un servicio de otro taller no existe para este taller, y
    // decir "prohibido" confirmaría que ese id existe en algún lado.
    if (!ok) return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error updating workshop service");
    return NextResponse.json({ error: "Error al guardar el servicio" }, { status: 500 });
  }
}

/** No borra: desactiva. Ver la nota en `deactivateWorkshopService`. */
export async function DELETE(request: Request, { params }: Params) {
  const { contactId, serviceId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    const ok = await deactivateWorkshopService(gate.contactId, serviceId);
    if (!ok) return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error deactivating workshop service");
    return NextResponse.json({ error: "Error al quitar el servicio" }, { status: 500 });
  }
}
