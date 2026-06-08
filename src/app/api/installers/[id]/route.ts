import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/installers/[id]");

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const installer = await prisma.contact.findFirst({ where: { id, type: "INSTALLER" } });
  if (!installer) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json(installer);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  try {
    const body = await request.json();
    const { firstName, lastName, phone, email, whatsapp, hasLocalStore, storeAddress, installerCountry, installerProvince, installerDepartment } = body;

    const installer = await prisma.contact.update({
      where: { id },
      data: {
        firstName,
        lastName,
        phone: phone || null,
        email: email || null,
        whatsapp: whatsapp || null,
        hasLocalStore: !!hasLocalStore,
        storeAddress: hasLocalStore ? (storeAddress || null) : null,
        installerCountry: installerCountry || null,
        installerProvince: installerCountry === "Argentina" ? (installerProvince || null) : null,
        installerDepartment: installerCountry === "Uruguay" ? (installerDepartment || null) : null,
      },
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "INSTALLER_UPDATED",
      entityType: "INSTALLER",
      entityId: id,
      description: `Actualizó el instalador "${firstName} ${lastName}"`,
      link: "/installers",
    });

    return NextResponse.json(installer);
  } catch (error) {
    log.error({ err: error }, "Error updating installer");
    return NextResponse.json({ error: "Error al actualizar instalador" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const userRole = (session.user as any).role as string;
  if (userRole !== "ADMIN" && userRole !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permisos para eliminar" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await prisma.$transaction([
      prisma.contactTag.deleteMany({ where: { contactId: id } }),
      prisma.activityLog.deleteMany({ where: { contactId: id } }),
      prisma.leadActivity.deleteMany({ where: { contactId: id } }),
      prisma.contact.delete({ where: { id } }),
    ]);

    await logOperatorAction({
      userId: session.user.id,
      action: "INSTALLER_DELETED",
      entityType: "INSTALLER",
      entityId: id,
      description: `Eliminó un instalador`,
      link: "/installers",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error deleting installer");
    return NextResponse.json({ error: "Error al eliminar instalador" }, { status: 500 });
  }
}
