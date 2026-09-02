import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { notifyAdmins } from "@/lib/notifications";
import { verifyWarrantyApiKey } from "@/lib/warranty-api-auth";
import { isWarrantyClaimable } from "@/lib/warranty";

const log = createLogger("api/public/warranty/claims");

/**
 * Reclamo de garantía. Dos formas de identificar la garantía, y no son
 * intercambiables:
 *
 * **`activationToken`** — el camino público, el del link que recibió el usuario
 * final. Como el token viaja en un mail que se puede reenviar, se exige además
 * que el email o el DNI coincidan con los de la activación: tener el link no
 * alcanza para reclamar en nombre de otro.
 *
 * **`installationCode`** — el camino del usuario que ya inició sesión en
 * kristall-web con su código y su contraseña. Acá **no** se pide email ni DNI, y
 * es a propósito: la persona ya probó quién es con algo que solo ella sabe, que
 * es más fuerte que repetir un dato que figura en el mail. Vale el mismo modelo
 * de confianza que la API de Portal de Clientes (sección 1 de
 * CLIENT_PORTAL_API.md): quien llama tiene la `x-api-key`, que vive solo en el
 * servidor de kristall-web, y se compromete a haber autenticado a esa persona.
 *
 * Existe porque hasta septiembre de 2026 la contraseña de la garantía servía
 * para mirar el estado y para nada más: para reclamar seguía haciendo falta el
 * link largo. Resolvía la mitad menos útil del problema.
 */
// Server-to-server, exclusivamente desde el backend de kristall-web: sin CORS a
// propósito (ver lib/cors.ts). Antes llevaba `Allow-Origin: *`, lo que permitía
// llamarlo desde el navegador de cualquier sitio.
export async function POST(request: Request) {
  const client = await verifyWarrantyApiKey(request);
  if (!client) {
    return NextResponse.json({ error: "API key inválida" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { activationToken, installationCode, reporterName, reporterEmail, reporterPhone, reporterDni, description } = body;

    const porCodigo = !activationToken && typeof installationCode === "string" && installationCode.length > 0;

    if (!reporterName || !description) {
      return NextResponse.json(
        { error: "reporterName y description son requeridos" },
        { status: 400 }
      );
    }
    if (!activationToken && !porCodigo) {
      return NextResponse.json(
        { error: "Hace falta activationToken o installationCode" },
        { status: 400 }
      );
    }
    // El email o el DNI solo se exigen en el camino del token — ver la nota de
    // arriba. Por código, la identidad ya la verificó quien llama.
    if (activationToken && !reporterEmail && !reporterDni) {
      return NextResponse.json(
        { error: "activationToken, reporterName, description y (reporterEmail o reporterDni) son requeridos" },
        { status: 400 }
      );
    }

    const installation = porCodigo
      ? await prisma.warrantyInstallation.findUnique({
          // utf8mb4_unicode_ci: la comparación no distingue mayúsculas, igual
          // que en el login por código.
          where: { installationCode: String(installationCode) },
        })
      : await prisma.warrantyInstallation.findUnique({
          where: { activationToken },
        });
    if (!installation) {
      return NextResponse.json({ error: "Garantía no encontrada" }, { status: 404 });
    }
    // No alcanza con leer la columna: EXPIRED se calcula en verifyWarranty() y
    // no hay job que lo persista, así que una garantía vencida sigue diciendo
    // ACTIVE en la base para siempre. La UI esconde el botón, pero
    // /garantia/<token>/reclamo es una URL directa que renderiza el form igual.
    if (!isWarrantyClaimable(installation)) {
      return NextResponse.json(
        {
          error:
            installation.status === "ACTIVE"
              ? "Esta garantía ya venció"
              : "Esta garantía no está activa",
        },
        { status: 400 }
      );
    }

    if (!porCodigo) {
      const emailMatches = reporterEmail && installation.clientEmail?.toLowerCase() === String(reporterEmail).toLowerCase();
      const dniMatches = reporterDni && installation.clientDni === String(reporterDni);
      if (!emailMatches && !dniMatches) {
        return NextResponse.json({ error: "Los datos no coinciden con los de la activación" }, { status: 403 });
      }
    }

    const claim = await prisma.warrantyClaim.create({
      data: {
        installationId: installation.id,
        description,
        reporterName,
        reporterEmail: reporterEmail ?? installation.clientEmail ?? "",
        reporterPhone: reporterPhone ?? null,
        channel: porCodigo ? "WARRANTY_PORTAL" : "PUBLIC_API",
      },
    });

    await notifyAdmins({
      type: "WARRANTY_CLAIM",
      // Un reclamo es alguien de afuera esperando respuesta: sale mail
      // además de la campanita. Ver la nota en notifyAdmins.
      email: true,
      title: porCodigo
        ? "Nuevo reclamo de garantía (portal de garantías)"
        : "Nuevo reclamo de garantía (web pública)",
      message: `${reporterName} reportó un problema (${installation.installationCode})`,
      link: `/warranty-claims`,
    });

    return NextResponse.json({ id: claim.id, status: claim.status }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating public warranty claim");
    return NextResponse.json({ error: "Error al crear el reclamo" }, { status: 500 });
  }
}
