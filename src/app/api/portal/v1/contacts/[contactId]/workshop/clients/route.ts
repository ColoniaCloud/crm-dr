import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { validateBody } from "@/lib/api-validation";
import { listWorkshopClients, createWorkshopClient } from "@/lib/workshop";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/clients");

type Params = { params: Promise<{ contactId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    const search = new URL(request.url).searchParams.get("search")?.trim() || undefined;
    return NextResponse.json(await listWorkshopClients(gate.contactId, search));
  } catch (error) {
    log.error({ err: error }, "Error listing workshop clients");
    return NextResponse.json({ error: "Error al cargar los clientes" }, { status: 500 });
  }
}

const clientSchema = z.object({
  name: z.string().trim().min(1).max(191),
  // `.or(z.literal(""))` no: una cadena vacía se manda como null desde el
  // formulario, no se guarda como "". Ver la nota en el doc, sección 4.10.
  email: z.string().email().max(191).nullish(),
  phone: z.string().trim().max(191).nullish(),
  dni: z.string().trim().max(191).nullish(),
  address: z.string().trim().max(191).nullish(),
  notes: z.string().max(5000).nullish(),
});

export async function POST(request: Request, { params }: Params) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(clientSchema, json);
  if (!validation.success) return validation.response;

  try {
    const client = await createWorkshopClient(gate.contactId, validation.data);
    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating workshop client");
    return NextResponse.json({ error: "Error al crear el cliente" }, { status: 500 });
  }
}
