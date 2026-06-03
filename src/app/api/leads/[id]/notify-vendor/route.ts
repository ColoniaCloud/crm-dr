import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendNotification, escapeHtml, logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/leads/[id]/notify-vendor");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { vendorId, actionType, note } = body;

    if (!vendorId || !actionType) {
      return NextResponse.json({ error: "vendorId y actionType son requeridos" }, { status: 400 });
    }

    if (actionType !== "VISIT" && actionType !== "CALL") {
      return NextResponse.json({ error: "actionType debe ser VISIT o CALL" }, { status: 400 });
    }

    // Get lead with activities
    const lead = await prisma.contact.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true } },
        leadActivities: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
    }

    // Get vendor user
    const vendor = await prisma.user.findUnique({
      where: { id: vendorId },
      select: { id: true, name: true, email: true },
    });

    if (!vendor || !vendor.email) {
      return NextResponse.json({ error: "Vendedor no encontrado" }, { status: 404 });
    }

    const actionLabel = actionType === "VISIT" ? "Agendar Visita" : "Agendar Llamada";
    const actionIcon = actionType === "VISIT" ? "📍" : "📞";
    const leadName = lead.company || `${lead.firstName} ${lead.lastName}`;

    // Build timeline HTML
    const timelineHtml = lead.leadActivities
      .map((a) => {
        const date = new Date(a.createdAt).toLocaleDateString("es-AR", {
          day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
        return `<tr>
          <td style="padding:6px 10px;font-size:12px;color:#888;white-space:nowrap;vertical-align:top;">${date}</td>
          <td style="padding:6px 10px;font-size:12px;color:#666;vertical-align:top;">${escapeHtml(a.user.name)}</td>
          <td style="padding:6px 10px;font-size:13px;color:#333;vertical-align:top;">
            <strong>${escapeHtml(a.title)}</strong>
            ${a.description ? `<br/><span style="color:#666;">${escapeHtml(a.description)}</span>` : ""}
          </td>
        </tr>`;
      })
      .join("");

    const location = [lead.address, lead.city, lead.state].filter(Boolean).join(", ");
    const waNum = lead.whatsapp ? lead.whatsapp.replace(/\D/g, "") : null;

    const btn =
      "display:inline-block;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;margin:0 6px 6px 0;";

    const contactButtons = [
      lead.phone ? `<a href="tel:${escapeHtml(lead.phone)}" style="${btn}background:#1d4ed8;color:#fff;">📞 Llamar</a>` : "",
      waNum ? `<a href="https://wa.me/${waNum}" style="${btn}background:#16a34a;color:#fff;" target="_blank">💬 WhatsApp</a>` : "",
      lead.email ? `<a href="mailto:${escapeHtml(lead.email)}" style="${btn}background:#7c3aed;color:#fff;">✉️ Email</a>` : "",
    ].filter(Boolean).join("");

    const emailMessage = `
<div style="text-align:center;margin-bottom:24px;padding:20px;background:${actionType === "VISIT" ? "#fef3c7" : "#dbeafe"};border-radius:10px;">
  <p style="margin:0;font-size:32px;">${actionIcon}</p>
  <h1 style="margin:8px 0 0 0;font-size:26px;color:#111;">${escapeHtml(actionLabel)}</h1>
</div>

<div style="background:#f4f4f5;border-radius:8px;padding:14px 16px;margin-bottom:16px;border:1px solid #e4e4e7;">
  <p style="margin:0 0 6px 0;font-weight:700;font-size:16px;color:#111;">${escapeHtml(leadName)}</p>
  ${lead.sector ? `<p style="margin:0 0 4px 0;color:#666;font-size:13px;">🏢 ${escapeHtml(lead.sector)}</p>` : ""}
  ${location ? `<p style="margin:0 0 4px 0;color:#666;font-size:13px;">📍 ${escapeHtml(location)}</p>` : ""}
  ${lead.phone ? `<p style="margin:0 0 4px 0;color:#555;font-size:13px;">📞 ${escapeHtml(lead.phone)}</p>` : ""}
  ${lead.email ? `<p style="margin:0 0 4px 0;color:#555;font-size:13px;">✉️ ${escapeHtml(lead.email)}</p>` : ""}
  ${lead.whatsapp ? `<p style="margin:0 0 4px 0;color:#555;font-size:13px;">💬 ${escapeHtml(lead.whatsapp)}</p>` : ""}
  ${lead.currentSupplier ? `<p style="margin:0 0 4px 0;color:#555;font-size:13px;">🏭 Proveedor: ${escapeHtml(lead.currentSupplier)}</p>` : ""}
  ${lead.vehicleFlowWeekly ? `<p style="margin:0 0 4px 0;color:#555;font-size:13px;">🚗 Flujo vehicular semanal: ${lead.vehicleFlowWeekly}</p>` : ""}
  ${lead.architecturalFlowMonthly ? `<p style="margin:0 0 4px 0;color:#555;font-size:13px;">🏗️ Flujo arquitectónico mensual: ${lead.architecturalFlowMonthly}</p>` : ""}
  ${lead.notes ? `<p style="margin:4px 0 0 0;color:#555;font-size:13px;">📝 ${escapeHtml(lead.notes)}</p>` : ""}
</div>

${contactButtons ? `<div style="margin-bottom:16px;">${contactButtons}</div>` : ""}

${note ? `<div style="margin-bottom:16px;padding:12px 16px;background:#fffbeb;border-radius:8px;border-left:4px solid #f59e0b;">
  <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:.05em;">Nota del operador</p>
  <p style="margin:0;font-size:14px;color:#78350f;white-space:pre-wrap;">${escapeHtml(note)}</p>
</div>` : ""}

${lead.leadActivities.length > 0 ? `
<h3 style="font-size:15px;color:#111;margin:20px 0 10px 0;">📋 Cronología</h3>
<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
  ${timelineHtml}
</table>
` : ""}
    `.trim();

    // Title for notification
    const notifTitle = `${actionIcon} ${actionLabel} — ${leadName}`;

    // Send notification (in-app + email)
    await sendNotification({
      userId: vendor.id,
      userEmail: vendor.email,
      userName: vendor.name,
      type: actionType === "VISIT" ? "VENDOR_VISIT" : "VENDOR_CALL",
      title: notifTitle,
      message: emailMessage,
      link: `/leads/${id}`,
      baseUrl: process.env.NEXTAUTH_URL,
    });

    // Log activity in timeline
    await prisma.leadActivity.create({
      data: {
        contactId: id,
        userId: session.user.id,
        type: actionType,
        title: `Notificación de ${actionType === "VISIT" ? "visita" : "llamada"} enviada a ${vendor.name}`,
        description: `Se solicitó a ${vendor.name} que ${actionType === "VISIT" ? "agende una visita" : "realice una llamada"} a este lead.`,
      },
    });

    // Log operator action
    await logOperatorAction({
      userId: session.user.id,
      action: `NOTIFY_VENDOR_${actionType}`,
      entityType: "CONTACT",
      entityId: id,
      description: `Notificó a ${vendor.name} para ${actionType === "VISIT" ? "agendar visita" : "agendar llamada"} a "${leadName}"`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error notifying vendor");
    return NextResponse.json({ error: "Error al enviar notificación" }, { status: 500 });
  }
}
