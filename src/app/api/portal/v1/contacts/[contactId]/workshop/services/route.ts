import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { getWorkshopServices, createWorkshopService } from "@/lib/workshop";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/services");

type Params = { params: Promise<{ contactId: string }> };

/**
 * El catálogo de servicios del taller: lo que se muestra en su página pública
 * y entre lo que elige el cliente al pedir turno.
 */

export async function GET(request: Request, { params }: Params) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    return NextResponse.json(await getWorkshopServices(gate.contactId));
  } catch (error) {
    log.error({ err: error }, "Error listing workshop services");
    return NextResponse.json({ error: "Error al cargar los servicios" }, { status: 500 });
  }
}

const schema = z.object({
  name: z.string().trim().min(2, "Poné un nombre").max(120),
  description: z.string().trim().max(2000).nullish(),
  /**
   * El precio es opcional: en polarizado depende del vehículo, y el instalador
   * decide si lo publica. `positive` y no `nonnegative` — un servicio a $0 es
   * casi siempre un error de tipeo, y si de verdad es gratis se dice en la
   * descripción.
   */
  priceFrom: z.number().positive("El precio tiene que ser mayor a 0").nullish(),
  currency: z.enum(["ARS", "USD"]).optional(),
  /**
   * 15 minutos es el turno más corto que tiene sentido, y 8 horas el más largo:
   * más que eso no es un turno, es un trabajo de varios días y se agenda a mano.
   */
  durationMinutes: z.number().int().min(15).max(480).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(schema, json);
  if (!validation.success) return validation.response;

  try {
    const creado = await createWorkshopService(gate.contactId, validation.data);
    return NextResponse.json(creado, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating workshop service");
    return NextResponse.json({ error: "Error al crear el servicio" }, { status: 500 });
  }
}
