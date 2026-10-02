import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
import { releaseRollForSaleItem } from "@/lib/warranty";
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

    const result = await prisma.contact.updateMany({
      where: { id, type: "INSTALLER" },
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

    if (result.count === 0) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    const installer = await prisma.contact.findUnique({ where: { id } });

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

  const userRole = session.user.role;
  if (userRole !== "ADMIN" && userRole !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permisos para eliminar" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const existing = await prisma.contact.findFirst({
      where: { id, type: "INSTALLER" },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    // Misma cascada que clients/[id] y contacts/[id]: un instalador también
    // puede tener ventas, pagos y presupuestos (es el mismo modelo Contact).
    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { contactId: id } });
      const saleIds = (await tx.sale.findMany({ where: { contactId: id }, select: { id: true } })).map((s) => s.id);
      if (saleIds.length > 0) {
        const saleItemIds = (await tx.saleItem.findMany({ where: { saleId: { in: saleIds } }, select: { id: true } })).map((i) => i.id);
        for (const saleItemId of saleItemIds) {
          await releaseRollForSaleItem(tx, saleItemId);
        }
        await tx.remito.deleteMany({ where: { saleId: { in: saleIds } } });
        await tx.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
      }
      await tx.sale.deleteMany({ where: { contactId: id } });
      const quoteIds = (await tx.quote.findMany({ where: { contactId: id }, select: { id: true } })).map((q) => q.id);
      if (quoteIds.length > 0) {
        await tx.quoteItem.deleteMany({ where: { quoteId: { in: quoteIds } } });
      }
      await tx.quote.deleteMany({ where: { contactId: id } });
      await tx.visit.deleteMany({ where: { contactId: id } });
      await tx.call.deleteMany({ where: { contactId: id } });
      await tx.contactTag.deleteMany({ where: { contactId: id } });
      await tx.activityLog.deleteMany({ where: { contactId: id } });
      await tx.leadActivity.deleteMany({ where: { contactId: id } });
      await tx.contact.delete({ where: { id } });
    });

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
