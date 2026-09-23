import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import {
  reorderWorkshopPhoto,
  deleteWorkshopPhoto,
  setWorkshopPhotoDescription,
} from "@/lib/workshop";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/photos/[photoId]");

type Params = { params: Promise<{ contactId: string; photoId: string }> };

/**
 * Dos operaciones sobre la misma foto, y el cuerpo decide cuál: `direccion`
 * la mueve de lugar, `description` cambia lo que se ve en ella. Van juntas en
 * un PATCH porque son eso, ediciones parciales del mismo recurso, y separarlas
 * en dos rutas obligaría a inventarle un sub-recurso a un campo de texto.
 */
const schema = z.union([
  z.object({ direccion: z.enum(["arriba", "abajo"]) }),
  z.object({ description: z.string().max(160).nullable() }),
]);

export async function PATCH(request: Request, { params }: Params) {
  const { contactId, photoId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(schema, json);
  if (!validation.success) return validation.response;

  try {
    const ok =
      "direccion" in validation.data
        ? await reorderWorkshopPhoto(gate.contactId, photoId, validation.data.direccion)
        : await setWorkshopPhotoDescription(
            gate.contactId,
            photoId,
            validation.data.description
          );
    // 404 y no 403: una foto de otro taller no existe para este taller.
    if (!ok) return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error updating workshop photo");
    return NextResponse.json({ error: "Error al actualizar la foto" }, { status: 500 });
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
