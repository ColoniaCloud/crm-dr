import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction, notifyAdmins } from "@/lib/notifications";

const log = createLogger("api/warranty-claims");

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const claims = await prisma.warrantyClaim.findMany({
      where: status ? { status: status as "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED" } : {},
      include: {
        installation: {
          include: {
            roll: {
              include: {
                product: { select: { id: true, name: true, sku: true } },
                lot: { select: { lotNumber: true } },
              },
            },
          },
        },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(claims);
  } catch (error) {
    log.error({ err: error }, "Error fetching warranty claims");
    return NextResponse.json({ error: "Error al obtener reclamos" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { installationId, description, reporterName, reporterEmail, reporterPhone } = body;

    if (!installationId || !description || !reporterName || !reporterEmail) {
      return NextResponse.json(
        { error: "installationId, description, reporterName y reporterEmail son requeridos" },
        { status: 400 }
      );
    }

    const installation = await prisma.warrantyInstallation.findUnique({
      where: { id: installationId },
    });
    if (!installation) {
      return NextResponse.json({ error: "Instalación no encontrada" }, { status: 404 });
    }

    const claim = await prisma.warrantyClaim.create({
      data: {
        installationId,
        description,
        reporterName,
        reporterEmail,
        reporterPhone: reporterPhone ?? null,
        channel: "INTERNAL",
      },
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "CREATE_WARRANTY_CLAIM",
      entityType: "WARRANTY_CLAIM",
      entityId: claim.id,
      description: `Registró un reclamo de garantía para "${installation.installationCode}"`,
      link: `/warranty-claims`,
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

    return NextResponse.json(claim, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating warranty claim");
    return NextResponse.json({ error: "Error al crear el reclamo" }, { status: 500 });
  }
}
