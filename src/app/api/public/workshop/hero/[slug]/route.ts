import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/public/workshop/hero/[slug]");

/**
 * Sirve la foto del hero de un taller como **imagen de verdad**, no como data
 * URI. Mismo motivo que el logo (`.../workshop/logo/[slug]/route.ts`): un
 * `<img src="data:...">` de este tamaño no tiene sentido embebido en el HTML,
 * y sirviendo los bytes con su `Content-Type` entra como una URL normal.
 *
 * **Va por slug y no por `contactId`**, y con un slug propio y no el del
 * logo: mismo criterio de `logoSlug` (ver la nota larga ahí) — el id interno
 * del taller no tiene que quedar a la vista en una página pública, y el hero
 * puede existir (o borrarse) independientemente del logo.
 *
 * Público a propósito y no expone nada más: solo dice si ese slug tiene una
 * foto. Sin hero, 404 igual que si el slug no existiera.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const settings = await prisma.workshopSettings.findUnique({
      where: { heroSlug: slug },
      select: { heroImage: true, heroImageMimeType: true },
    });

    if (!settings?.heroImage) {
      return new NextResponse(null, { status: 404 });
    }

    const bytes = Buffer.from(settings.heroImage, "base64");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": settings.heroImageMimeType ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400",
        "Content-Length": String(bytes.length),
      },
    });
  } catch (error) {
    log.error({ err: error }, "Error serving workshop hero image");
    return new NextResponse(null, { status: 404 });
  }
}
