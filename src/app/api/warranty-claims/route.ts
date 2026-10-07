import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction, notifyAdmins } from "@/lib/notifications";
import { conResumen, crearReclamo, datosReclamoSchema } from "@/lib/warranty-claims";

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
                // `category` para saber si mostrar los datos de la obra.
                product: { select: { id: true, name: true, sku: true, category: true } },
                lot: { select: { lotNumber: true } },
              },
            },
          },
        },
        assignedTo: { select: { id: true, name: true } },
        // Solo los ids: el contenido (base64) se pide foto por foto a
        // /api/warranty-claims/:id/photos/:photoId, que es lo que dibuja <img>.
        photos: { select: { id: true }, orderBy: { createdAt: "asc" } },
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


    // Tipo de problema, paños y fotos. Opcionales; la regla del rubro la
    // aplica crearReclamo().
    const extras = datosReclamoSchema.safeParse(body);
    if (!extras.success) {
      return NextResponse.json(
        { error: extras.error.issues[0]?.message ?? "Datos del reclamo inválidos" },
        { status: 400 }
      );
    }

    const claim = await crearReclamo(
      {
        installationId: installationId,
        description,
        reporterName,
        reporterEmail: reporterEmail,
        reporterPhone: reporterPhone ?? null,
        channel: "INTERNAL",
      },
      extras.data
    );
    if (!claim.ok) {
      return NextResponse.json({ error: claim.error }, { status: claim.status });
    }

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
      message: conResumen(`${reporterName} reportó un problema (${installation.installationCode})`, extras.data),
      link: `/warranty-claims`,
    });

    return NextResponse.json({ id: claim.id, status: claim.status }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating warranty claim");
    return NextResponse.json({ error: "Error al crear el reclamo" }, { status: 500 });
  }
}
