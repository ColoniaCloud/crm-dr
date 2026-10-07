import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/warranty-installations/search");

/**
 * Busca instalaciones por lo que la gente dice cuando llama: la dirección de la
 * obra o la patente. Nadie se acuerda de «LOT-20260705-0001-R003-I1».
 *
 *   GET /api/warranty-installations/search?q=<texto>
 *
 * Devuelve hasta 20 coincidencias con el rollo de cada una; el Centro de
 * Garantías abre la trazabilidad del rollo con el buscador de código que ya
 * existía. ADMIN+, igual que el resto del Centro de Garantías: la dirección va
 * completa.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  // Con menos de 3 letras «contains» devuelve media base.
  if (q.length < 3) return NextResponse.json([]);

  try {
    // La patente se guarda en mayúsculas (createAdditionalInstallation); la
    // dirección tal cual. La collation de MySQL ya compara sin mayúsculas.
    const installations = await prisma.warrantyInstallation.findMany({
      where: {
        OR: [
          { siteAddress: { contains: q } },
          { plate: { contains: q.toUpperCase().replace(/\s+/g, "") } },
          { plate: { contains: q.toUpperCase() } },
          { installationCode: { contains: q } },
        ],
      },
      select: {
        id: true,
        installationCode: true,
        status: true,
        siteAddress: true,
        plate: true,
        clientName: true,
        roll: { select: { fullRollCode: true, product: { select: { name: true, category: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json(installations);
  } catch (error) {
    log.error({ err: error }, "Error searching warranty installations");
    return NextResponse.json({ error: "Error al buscar" }, { status: 500 });
  }
}
