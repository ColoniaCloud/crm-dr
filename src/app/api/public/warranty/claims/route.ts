import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { notifyAdmins } from "@/lib/notifications";
import { verifyWarrantyApiKey } from "@/lib/warranty-api-auth";
import { withCors, corsPreflight } from "@/lib/cors";

const log = createLogger("api/public/warranty/claims");

export function OPTIONS() {
  return corsPreflight();
}

// Public endpoint for reporting a warranty claim. Requires the same
// identity data used at activation (email or DNI) to match, so a claim
// can't be filed with just the roll/installation code.
export async function POST(request: Request) {
  const client = await verifyWarrantyApiKey(request);
  if (!client) {
    return withCors(NextResponse.json({ error: "API key inválida" }, { status: 401 }));
  }

  try {
    const body = await request.json();
    const { activationToken, reporterName, reporterEmail, reporterPhone, reporterDni, description } = body;

    if (!activationToken || !reporterName || !description || (!reporterEmail && !reporterDni)) {
      return withCors(
        NextResponse.json(
          { error: "activationToken, reporterName, description y (reporterEmail o reporterDni) son requeridos" },
          { status: 400 }
        )
      );
    }

    const installation = await prisma.warrantyInstallation.findUnique({
      where: { activationToken },
    });
    if (!installation) {
      return withCors(NextResponse.json({ error: "Garantía no encontrada" }, { status: 404 }));
    }
    if (installation.status !== "ACTIVE") {
      return withCors(NextResponse.json({ error: "Esta garantía no está activa" }, { status: 400 }));
    }

    const emailMatches = reporterEmail && installation.clientEmail?.toLowerCase() === String(reporterEmail).toLowerCase();
    const dniMatches = reporterDni && installation.clientDni === String(reporterDni);
    if (!emailMatches && !dniMatches) {
      return withCors(
        NextResponse.json({ error: "Los datos no coinciden con los de la activación" }, { status: 403 })
      );
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
      title: "Nuevo reclamo de garantía (web pública)",
      message: `${reporterName} reportó un problema (${installation.installationCode})`,
      link: `/warranty-claims`,
    });

    return withCors(NextResponse.json({ id: claim.id, status: claim.status }, { status: 201 }));
  } catch (error) {
    log.error({ err: error }, "Error creating public warranty claim");
    return withCors(NextResponse.json({ error: "Error al crear el reclamo" }, { status: 500 }));
  }
}
