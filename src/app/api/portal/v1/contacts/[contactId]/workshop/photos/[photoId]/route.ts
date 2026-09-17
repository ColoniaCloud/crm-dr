import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { reorderWorkshopPhoto, deleteWorkshopPhoto } from "@/lib/workshop";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/photos/[photoId]");

type Params = { params: Promise<{ contactId: string; photoId: string }> };

const schema = z.object({ direccion: z.enum(["arriba", "abajo"]) });

/** Reordenar: intercambia el lugar con el vecino de arriba o de abajo. */
export async function PATCH(request: Request, { params }: Params) {
  const { contactId, photoId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(schema, json);
  if (!validation.success) return validation.response;

  try {
    const ok = await reorderWorkshopPhoto(gate.contactId, photoId, validation.data.direccion);
    // 404 y no 403: una foto de otro taller no existe para este taller.
    if (!ok) return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error reordering workshop photo");
    return NextResponse.json({ error: "Error al reordenar el álbum" }, { status: 500 });
  }
}

/** A diferencia de un servicio, esto sí borra de verdad. Ver la nota en `deleteWorkshopPhoto`. */
export async function DELETE(request: Request, { params }: Params) {
  const { contactId, photoId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    const ok = await deleteWorkshopPhoto(gate.contactId, photoId);
    if (!ok) return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error deleting workshop photo");
    return NextResponse.json({ error: "Error al borrar la foto" }, { status: 500 });
  }
}
