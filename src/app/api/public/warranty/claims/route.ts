import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { notifyAdmins } from "@/lib/notifications";
import { verifyWarrantyApiKey } from "@/lib/warranty-api-auth";
import { isWarrantyClaimable } from "@/lib/warranty";

const log = createLogger("api/public/warranty/claims");

// Public endpoint for reporting a warranty claim. Requires the same
// identity data used at activation (email or DNI) to match, so a claim
// can't be filed with just the roll/installation code.
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
    const { activationToken, reporterName, reporterEmail, reporterPhone, reporterDni, description } = body;

    if (!activationToken || !reporterName || !description || (!reporterEmail && !reporterDni)) {
      return NextResponse.json(
        { error: "activationToken, reporterName, description y (reporterEmail o reporterDni) son requeridos" },
        { status: 400 }
      );
    }

    const installation = await prisma.warrantyInstallation.findUnique({
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

    const emailMatches = reporterEmail && installation.clientEmail?.toLowerCase() === String(reporterEmail).toLowerCase();
    const dniMatches = reporterDni && installation.clientDni === String(reporterDni);
    if (!emailMatches && !dniMatches) {
      return NextResponse.json({ error: "Los datos no coinciden con los de la activación" }, { status: 403 });
    }

    const claim = await prisma.warrantyClaim.create({
      data: {
        installationId: installation.id,
        description,
        reporterName,
        reporterEmail: reporterEmail ?? installation.clientEmail ?? "",
        reporterPhone: reporterPhone ?? null,
        channel: "PUBLIC_API",
      },
    });

    await notifyAdmins({
      type: "WARRANTY_CLAIM",
      // Un reclamo es alguien de afuera esperando respuesta: sale mail
      // además de la campanita. Ver la nota en notifyAdmins.
      email: true,
      title: "Nuevo reclamo de garantía (web pública)",
      message: `${reporterName} reportó un problema (${installation.installationCode})`,
      link: `/warranty-claims`,
    });

    return NextResponse.json({ id: claim.id, status: claim.status }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating public warranty claim");
    return NextResponse.json({ error: "Error al crear el reclamo" }, { status: 500 });
  }
}
