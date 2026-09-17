import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { getWorkshopPhotos, createWorkshopPhoto } from "@/lib/workshop";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/photos");

type Params = { params: Promise<{ contactId: string }> };

/**
 * El álbum de fotos del taller: lo que se muestra en su página pública, al
 * lado del botón de reservar turno y como fondo de la sección de cierre.
 */

export async function GET(request: Request, { params }: Params) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  try {
    return NextResponse.json(await getWorkshopPhotos(gate.contactId));
  } catch (error) {
    log.error({ err: error }, "Error listing workshop photos");
    return NextResponse.json({ error: "Error al cargar el álbum" }, { status: 500 });
  }
}

const MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
/**
 * 800 KB de base64 ≈ 600 KB de imagen. Más chico que el hero (2 MB): acá hay
 * hasta 12, no 1, y el navegador ya la recomprime a 1200px antes de mandarla.
 */
const MAX_BASE64 = 800 * 1024;

const schema = z.object({
  image: z.string().max(MAX_BASE64, "La imagen es muy pesada"),
  imageMimeType: z.enum(MIMES),
});

export async function POST(request: Request, { params }: Params) {
  const { contactId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(schema, json);
  if (!validation.success) return validation.response;

  try {
    const resultado = await createWorkshopPhoto(gate.contactId, validation.data);
    if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 });
    return NextResponse.json({ id: resultado.id }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating workshop photo");
    return NextResponse.json({ error: "Error al subir la foto" }, { status: 500 });
  }
}
