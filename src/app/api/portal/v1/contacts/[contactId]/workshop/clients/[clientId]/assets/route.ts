import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { validateBody } from "@/lib/api-validation";
import { listWorkshopAssets, createWorkshopAsset } from "@/lib/workshop";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/clients/[clientId]/assets");

type Params = { params: Promise<{ contactId: string; clientId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { contactId, clientId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    const assets = await listWorkshopAssets(gate.contactId, clientId);
    // null = el cliente final no existe o es de otro taller. Las dos cosas se
    // ven igual desde afuera, a propósito.
    if (assets === null) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    return NextResponse.json(assets);
  } catch (error) {
    log.error({ err: error }, "Error listing workshop assets");
    return NextResponse.json({ error: "Error al cargar los vehículos" }, { status: 500 });
  }
}

const assetSchema = z.object({
  type: z.enum(["VEHICLE", "WINDOW", "BUILDING", "OTHER"]).optional(),
  identifier: z.string().trim().max(191).nullish(),
  brand: z.string().trim().max(191).nullish(),
  model: z.string().trim().max(191).nullish(),
  // Rango amplio a propósito: hay autos clásicos con lámina, y un tope
  // apretado solo genera un error incomprensible al cargar un Ford del 40.
  year: z.number().int().min(1900).max(2100).nullish(),
  color: z.string().trim().max(191).nullish(),
  notes: z.string().max(5000).nullish(),
});

export async function POST(request: Request, { params }: Params) {
  const { contactId, clientId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(assetSchema, json);
  if (!validation.success) return validation.response;

  try {
    const asset = await createWorkshopAsset(gate.contactId, clientId, validation.data);
    if (!asset) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating workshop asset");
    return NextResponse.json({ error: "Error al crear el vehículo" }, { status: 500 });
  }
}
