import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { validateBody } from "@/lib/api-validation";
import {
  getWorkshopClient,
  updateWorkshopClient,
  deleteWorkshopClient,
} from "@/lib/workshop";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/clients/[clientId]");

type Params = { params: Promise<{ contactId: string; clientId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { contactId, clientId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    const client = await getWorkshopClient(gate.contactId, clientId);
    // 404 y no 403 cuando el cliente existe pero es de otro taller: confirmar
    // "existe pero no es tuyo" ya sería filtrar información.
    if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    return NextResponse.json(client);
  } catch (error) {
    log.error({ err: error }, "Error fetching workshop client");
    return NextResponse.json({ error: "Error al cargar el cliente" }, { status: 500 });
  }
}

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(191),
    email: z.string().email().max(191).nullable(),
    phone: z.string().trim().max(191).nullable(),
    dni: z.string().trim().max(191).nullable(),
    address: z.string().trim().max(191).nullable(),
    notes: z.string().max(5000).nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "No hay nada que actualizar" });

export async function PATCH(request: Request, { params }: Params) {
  const { contactId, clientId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(patchSchema, json);
  if (!validation.success) return validation.response;

  try {
    const client = await updateWorkshopClient(gate.contactId, clientId, validation.data);
    if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    return NextResponse.json(client);
  } catch (error) {
    log.error({ err: error }, "Error updating workshop client");
    return NextResponse.json({ error: "Error al actualizar el cliente" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { contactId, clientId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    const result = await deleteWorkshopClient(gate.contactId, clientId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error deleting workshop client");
    return NextResponse.json({ error: "Error al borrar el cliente" }, { status: 500 });
  }
}
