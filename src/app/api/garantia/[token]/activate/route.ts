import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { activateInstallationWarranty } from "@/lib/warranty";
import { datosObraSchema } from "@/lib/obra";
import { notifyWarrantyActivated } from "@/lib/client-portal";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

const log = createLogger("api/garantia/[token]/activate");

// First-party endpoint para /garantia/[token]: sin API key porque lo llama el
// navegador del cliente final, no un server. El límite por IP es lo único que
// frena intentar activar en masa contra tokens cuid viejos (adivinables).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = rateLimit(`garantia-activate:${clientIp(request)}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Demasiados intentos. Esperá ${rl.retryAfter}s.` },
      { status: 429 }
    );
  }

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

    // Datos de obra, solo para láminas de arquitectura (el rollo decide, no el
    // body). Lo que ya precargó el taller no se pisa — ver ActivateWarrantyData.
    const obra = datosObraSchema.safeParse(body);
    if (!obra.success) {
      return NextResponse.json({ error: "Datos de la obra inválidos" }, { status: 400 });
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
      obra: obra.data,
    });
    await notifyWarrantyActivated(installation.id);

    return NextResponse.json({ activated: true, expiresAt });
  } catch (error) {
    log.error({ err: error }, "Error activating warranty");
    return NextResponse.json({ error: "Error al activar la garantía" }, { status: 500 });
  }
}
