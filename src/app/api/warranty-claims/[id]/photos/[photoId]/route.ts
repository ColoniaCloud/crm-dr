import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/warranty-claims/[id]/photos/[photoId]");

/**
 * Una foto de un reclamo de garantía, para el Centro de Garantías.
 *
 * **Autenticada y ADMIN+**, igual que el resto del Centro de Garantías: es la
 * casa o el auto de una persona. El `claimId` entra en el `findFirst`, así que
 * un photoId de otro reclamo devuelve 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const { id, photoId } = await params;
    const foto = await prisma.warrantyClaimPhoto.findFirst({
      where: { id: photoId, claimId: id },
      select: { data: true, mimeType: true },
    });
    if (!foto) return new NextResponse(null, { status: 404 });

    const bytes = Buffer.from(foto.data, "base64");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": foto.mimeType,
        "Content-Length": String(bytes.length),
        // Privada: no la puede cachear un proxy compartido.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    log.error({ err: error }, "Error serving warranty claim photo");
    return new NextResponse(null, { status: 404 });
  }
}
