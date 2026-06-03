import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendNotification, escapeHtml, logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
import { isAdminRole } from "@/lib/utils";
const log = createLogger("api/leads/[id]");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const lead = await prisma.contact.findFirst({
      where: { id, type: "LEAD" },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        tags: {
          include: { tag: true },
        },
        visits: {
          include: {
            assignedTo: { select: { id: true, name: true } },
          },
          orderBy: { scheduledDate: "desc" },
        },
        calls: {
          include: {
            assignedTo: { select: { id: true, name: true } },
          },
          orderBy: { scheduledAt: "desc" },
        },
        quotes: {
          include: {
            items: { include: { product: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
    }

    return NextResponse.json(lead);
  } catch (error) {
    log.error({ err: error }, "Error fetching lead");
    return NextResponse.json(
      { error: "Error al cargar lead" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const existingLead = await prisma.contact.findFirst({
      where: { id, type: "LEAD" },
      select: { id: true, assignedToId: true, firstName: true, lastName: true, company: true },
    });

    if (!existingLead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
    }

    const data: Record<string, unknown> = { ...body };

    if ("contactMethod" in data) {
      data.contactMethod = data.contactMethod || "NONE";
    }

    if ("contactDate" in data) {
      data.contactDate = data.contactDate ? new Date(data.contactDate as string) : null;
    }

    // Check if assignedToId is changing
    const assignmentChanged = body.assignedToId && body.assignedToId !== existingLead.assignedToId;

    await prisma.contact.updateMany({
      where: { id, type: "LEAD" },
      data,
    });

    const lead = await prisma.contact.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
    }

    // Notify when lead is assigned — always notify BOTH operators (Natalia & Carlos)
    if (assignmentChanged && lead.assignedTo) {
      const contactName = lead.company || `${lead.firstName} ${lead.lastName}`.trim();
      const leadNumber = `L-${String(lead.leadNumber).padStart(4, "0")}`;
      const operatorName = session.user.name || "Operador";
      const assignedName = lead.assignedTo.name;
      const contactDate = lead.contactDate
        ? new Date(lead.contactDate).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "Sin fecha";

      // Build intelligence summary
      const intelParts: string[] = [];
      if (lead.vehicleFlowWeekly) intelParts.push(`Flujo vehicular semanal: ${lead.vehicleFlowWeekly}`);
      if (lead.architecturalFlowMonthly) intelParts.push(`Flujo arquitectónico mensual: ${lead.architecturalFlowMonthly}`);
      if (lead.currentSupplier) intelParts.push(`Proveedor actual: ${escapeHtml(lead.currentSupplier)}`);
      if (lead.currentSupplierPrices) intelParts.push(`Precios proveedor: ${escapeHtml(lead.currentSupplierPrices)}`);
      const intelHtml = intelParts.length > 0 ? intelParts.join("<br/>") : "Sin datos";

      const emailSubject = `Lead contactado asignado a ${assignedName}`;
      const emailBody = `
        <p>El operador <strong>${escapeHtml(operatorName)}</strong> ha asignado el lead <strong>${leadNumber}</strong> a <strong>${escapeHtml(assignedName)}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;width:180px;">Nombre de la empresa</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(contactName)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Fecha de contacto</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${contactDate}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Inteligencia del lead</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${intelHtml}</td></tr>
          <tr><td style="padding:8px 12px;color:#6b7280;font-weight:600;">Notas</td><td style="padding:8px 12px;">${lead.notes ? escapeHtml(lead.notes) : "Sin notas"}</td></tr>
        </table>
      `;

      // Notify all SUPERADMINs + the assigned user
      const superAdmins = await prisma.user.findMany({
        where: { deletedAt: null, role: "SUPERADMIN" },
        select: { id: true, name: true, email: true },
      });

      const usersToNotify = superAdmins.length > 0
        ? [...superAdmins, lead.assignedTo]
        : [lead.assignedTo];

      // Notify each user (deduplicated)
      const notifiedIds = new Set<string>();
      for (const user of usersToNotify) {
        if (notifiedIds.has(user.id)) continue;
        notifiedIds.add(user.id);
        await sendNotification({
          userId: user.id,
          userEmail: user.email!,
          userName: user.name,
          type: "LEAD_ASSIGNED",
          title: emailSubject,
          message: emailBody,
          link: `/leads/${id}`,
        });
      }
    }

    // Log operator action
    const logName = lead.company || `${lead.firstName} ${lead.lastName}`.trim();
    const changes: string[] = [];
    if (assignmentChanged) changes.push(`asignado a ${lead.assignedTo?.name}`);
    if ("contacted" in body) changes.push(body.contacted ? "marcado contactado" : "desmarcado contactado");
    if ("contactMethod" in body) changes.push(`método: ${body.contactMethod}`);
    if ("notes" in body) changes.push("notas actualizadas");
    if ("vehicleFlowWeekly" in body || "architecturalFlowMonthly" in body) changes.push("inteligencia actualizada");
    const desc = changes.length > 0
      ? `Editó lead "${logName}" · ${changes.join(", ")}`
      : `Editó lead "${logName}"`;
    await logOperatorAction({
      userId: session.user.id,
      action: "UPDATE_LEAD",
      entityType: "LEAD",
      entityId: id,
      description: desc,
      link: `/leads/${id}`,
    });

    return NextResponse.json(lead);
  } catch (error) {
    log.error({ err: error }, "Error updating lead");
    return NextResponse.json(
      { error: "Error al actualizar lead" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (!isAdminRole(session.user.role)) {
      return NextResponse.json({ error: "Solo administradores pueden eliminar leads" }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.contact.findFirst({
      where: { id, type: "LEAD" },
      select: { id: true, firstName: true, lastName: true, company: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
    }

    const deletedName = existing.company || `${existing.firstName} ${existing.lastName}`.trim();

    // Delete all child records in correct order within a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Payments (FK to sale + contact, no cascade)
      await tx.payment.deleteMany({ where: { contactId: id } });
      // 2. Remitos + sale items via sale IDs
      const saleIds = (await tx.sale.findMany({ where: { contactId: id }, select: { id: true } })).map((s) => s.id);
      if (saleIds.length > 0) {
        await tx.remito.deleteMany({ where: { saleId: { in: saleIds } } });
        await tx.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
      }
      // 3. Sales
      await tx.sale.deleteMany({ where: { contactId: id } });
      // 4. Quote items then quotes
      const quoteIds = (await tx.quote.findMany({ where: { contactId: id }, select: { id: true } })).map((q) => q.id);
      if (quoteIds.length > 0) {
        await tx.quoteItem.deleteMany({ where: { quoteId: { in: quoteIds } } });
      }
      await tx.quote.deleteMany({ where: { contactId: id } });
      // 5. Visits, calls, tags, activities
      await tx.visit.deleteMany({ where: { contactId: id } });
      await tx.call.deleteMany({ where: { contactId: id } });
      await tx.contactTag.deleteMany({ where: { contactId: id } });
      await tx.activityLog.deleteMany({ where: { contactId: id } });
      await tx.leadActivity.deleteMany({ where: { contactId: id } });
      // 6. Finally delete the contact
      await tx.contact.delete({ where: { id } });
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "DELETE_LEAD",
      entityType: "LEAD",
      entityId: id,
      description: `Eliminó lead "${deletedName}"`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error deleting lead");
    return NextResponse.json(
      { error: "Error al eliminar lead" },
      { status: 500 }
    );
  }
}
