import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/public/workshop/gallery/[slug]/[photoId]");

/**
 * Sirve una foto del álbum como **imagen de verdad**, no como data URI —
 * mismo motivo que el logo y el hero.
 *
 * Dos pasos y no un solo `findUnique` por `photoId`: primero se resuelve el
 * `gallerySlug` a un taller, y **recién ahí** se busca la foto filtrando
 * también por `contactId` de ese taller. Así, aunque alguien adivinara un
 * `photoId` válido de OTRO taller, no podría verla colgada del slug de este
 * — el slug no alcanza por sí solo, tiene que ser su propio slug.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; photoId: string }> }
) {
  try {
    const { slug, photoId } = await params;
    const settings = await prisma.workshopSettings.findUnique({
      where: { gallerySlug: slug },
      select: { contactId: true },
    });
    if (!settings) return new NextResponse(null, { status: 404 });

    const foto = await prisma.workshopPhoto.findFirst({
      where: { id: photoId, contactId: settings.contactId },
      select: { image: true, imageMimeType: true },
    });
    if (!foto) return new NextResponse(null, { status: 404 });

    const bytes = Buffer.from(foto.image, "base64");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": foto.imageMimeType,
        "Cache-Control": "public, max-age=86400",
        "Content-Length": String(bytes.length),
      },
    });
  } catch (error) {
    log.error({ err: error }, "Error serving workshop gallery photo");
    return new NextResponse(null, { status: 404 });
  }
}
