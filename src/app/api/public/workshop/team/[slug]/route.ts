import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/public/workshop/team/[slug]");

/**
 * Sirve la foto del equipo de un taller como imagen de verdad, no como data
 * URI — mismo motivo y misma forma que el hero y el logo.
 *
 * **Va por slug propio y no por `contactId`**: el id interno del taller no
 * tiene que quedar a la vista en una página pública, y esta foto puede
 * existir o borrarse sin tocar las otras dos.
 *
 * Público a propósito y no expone nada más: solo dice si ese slug tiene
 * foto. Sin foto, 404, igual que si el slug no existiera.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const settings = await prisma.workshopSettings.findUnique({
      where: { teamSlug: slug },
      select: { teamImage: true, teamImageMimeType: true },
    });

    if (!settings?.teamImage) {
      return new NextResponse(null, { status: 404 });
    }

    const bytes = Buffer.from(settings.teamImage, "base64");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": settings.teamImageMimeType ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    log.error({ err: error }, "Error serving workshop team photo");
    return new NextResponse(null, { status: 500 });
  }
}
