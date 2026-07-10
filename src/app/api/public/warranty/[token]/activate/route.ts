import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { activateInstallationWarranty } from "@/lib/warranty";
import { verifyWarrantyApiKey } from "@/lib/warranty-api-auth";
import { withCors, corsPreflight } from "@/lib/cors";
import { notifyWarrantyActivated } from "@/lib/client-portal";

const log = createLogger("api/public/warranty/[token]/activate");

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const client = await verifyWarrantyApiKey(request);
  if (!client) {
    return withCors(NextResponse.json({ error: "API key inválida" }, { status: 401 }));
  }

  try {
    const { token } = await params;
    const installation = await prisma.warrantyInstallation.findUnique({
      where: { activationToken: token },
    });
    if (!installation) {
      return withCors(NextResponse.json({ error: "Garantía no encontrada" }, { status: 404 }));
    }
    if (installation.status !== "PENDING") {
      return withCors(NextResponse.json({ error: "Esta garantía ya fue activada" }, { status: 400 }));
    }

    const body = await request.json();
    const { assetType, assetDescription, clientName, clientEmail, clientPhone, clientDni, installedAt, installerName, notes } = body;

    if (!assetType || !clientName || !clientEmail) {
      return withCors(
        NextResponse.json({ error: "assetType, clientName y clientEmail son requeridos" }, { status: 400 })
      );
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

    return withCors(NextResponse.json({ activated: true, expiresAt }));
  } catch (error) {
    log.error({ err: error }, "Error activating warranty");
    return withCors(NextResponse.json({ error: "Error al activar la garantía" }, { status: 500 }));
  }
}
