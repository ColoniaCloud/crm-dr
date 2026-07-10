import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { activateInstallationWarranty } from "@/lib/warranty";
import { notifyWarrantyActivated } from "@/lib/client-portal";

const log = createLogger("api/garantia/[token]/activate");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const installation = await prisma.warrantyInstallation.findUnique({
      where: { activationToken: token },
    });
    if (!installation) {
      return NextResponse.json({ error: "Garantía no encontrada" }, { status: 404 });
    }
    if (installation.status !== "PENDING") {
      return NextResponse.json({ error: "Esta garantía ya fue activada" }, { status: 400 });
    }

    const body = await request.json();
    const { assetType, assetDescription, clientName, clientEmail, clientPhone, clientDni, installedAt, installerName, notes } = body;

    if (!assetType || !clientName || !clientEmail) {
      return NextResponse.json({ error: "assetType, clientName y clientEmail son requeridos" }, { status: 400 });
    }

    const { expiresAt } = await activateInstallationWarranty(installation.id, {
      assetType,
      assetDescription,
      clientName,
      clientEmail,
      clientPhone,
      clientDni,
      installedAt: installedAt ? new Date(installedAt) : undefined,
      installerName,
      notes,
    });
    await notifyWarrantyActivated(installation.id);

    return NextResponse.json({ activated: true, expiresAt });
  } catch (error) {
    log.error({ err: error }, "Error activating warranty");
    return NextResponse.json({ error: "Error al activar la garantía" }, { status: 500 });
  }
}
