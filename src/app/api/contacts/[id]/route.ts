import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
const log = createLogger("api/contacts/[id]");

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const existing = await prisma.contact.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, company: true, type: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { contactId: id } });
      const saleIds = (await tx.sale.findMany({ where: { contactId: id }, select: { id: true } })).map((s) => s.id);
      if (saleIds.length > 0) {
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

    const cName = existing.company || `${existing.firstName} ${existing.lastName}`.trim();
    await logOperatorAction({ userId: session.user.id, action: "DELETE_CONTACT", entityType: existing.type || "CONTACT", entityId: id, description: `Eliminó contacto "${cName}"` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error deleting contact");
    return NextResponse.json(
      { error: "Error al eliminar el contacto" },
      { status: 500 }
    );
  }
}
