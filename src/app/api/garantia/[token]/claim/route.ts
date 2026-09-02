import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { notifyAdmins } from "@/lib/notifications";

const log = createLogger("api/garantia/[token]/claim");

// Same matching rule as /api/public/warranty/claims: the reporter must
// provide the email or DNI used at activation — the code alone isn't enough.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { reporterName, reporterEmail, reporterPhone, reporterDni, description } = body;

    if (!reporterName || !description || (!reporterEmail && !reporterDni)) {
      return NextResponse.json(
        { error: "reporterName, description y (reporterEmail o reporterDni) son requeridos" },
        { status: 400 }
      );
    }

    const installation = await prisma.warrantyInstallation.findUnique({
      where: { activationToken: token },
    });
    if (!installation) {
      return NextResponse.json({ error: "Garantía no encontrada" }, { status: 404 });
    }
    if (installation.status !== "ACTIVE") {
      return NextResponse.json({ error: "Esta garantía no está activa" }, { status: 400 });
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
        channel: "INTERNAL",
      },
    });

    await notifyAdmins({
      type: "WARRANTY_CLAIM",
      // Un reclamo es alguien de afuera esperando respuesta: sale mail
      // además de la campanita. Ver la nota en notifyAdmins.
      email: true,
      title: "Nuevo reclamo de garantía",
      message: `${reporterName} reportó un problema (${installation.installationCode})`,
      link: `/warranty-claims`,
    });

    return NextResponse.json({ id: claim.id, status: claim.status }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating warranty claim");
    return NextResponse.json({ error: "Error al crear el reclamo" }, { status: 500 });
  }
}
