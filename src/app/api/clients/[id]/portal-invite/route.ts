import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction, escapeHtml } from "@/lib/notifications";
import { transporter, isSmtpConfigured, FROM } from "@/lib/mailer";
import { issuePortalToken, portalBaseUrl } from "@/lib/portal-tokens";

const log = createLogger("api/clients/[id]/portal-invite");

/**
 * Manda al Cliente el mail para que cree su cuenta del portal.
 *
 * Es el camino que usa un operador desde la ficha. El otro camino, la
 * auto-activación (el cliente entra a kristallfilm.com y pone su email), sale
 * por `/api/portal/v1/auth/request-activation` y termina en el mismo token.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id } = await params;

    const contact = await prisma.contact.findFirst({
      where: { id, type: "CLIENT" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        email: true,
        portalAccount: { select: { id: true, activatedAt: true, enabled: true } },
      },
    });
    if (!contact) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    if (!contact.email) {
      return NextResponse.json(
        { error: "Este cliente no tiene email cargado. Cargalo en la ficha antes de invitarlo." },
        { status: 400 }
      );
    }
    if (contact.portalAccount?.activatedAt) {
      return NextResponse.json(
        {
          error:
            "Este cliente ya activó su cuenta. Si perdió la contraseña, tiene que usar «Olvidé mi contraseña» en el portal.",
        },
        { status: 409 }
      );
    }
    if (!isSmtpConfigured()) {
      return NextResponse.json(
        { error: "El envío de mails no está configurado en el servidor (falta SMTP)." },
        { status: 503 }
      );
    }

    const { token, expiresAt } = await issuePortalToken({
      contactId: contact.id,
      accountId: contact.portalAccount?.id ?? null,
      purpose: "ACTIVATION",
      sentToEmail: contact.email,
    });

    const nombre = contact.company || `${contact.firstName} ${contact.lastName}`.trim();
    const link = `${portalBaseUrl()}/cliente/activar/${token}`;

    await transporter.sendMail({
      from: FROM(),
      to: contact.email,
      subject: "Activá tu acceso al Panel de Clientes — Kristall Film",
      html: `
        <p>Hola ${escapeHtml(contact.firstName)},</p>
        <p>Te damos acceso al <strong>Panel de Clientes</strong> de Kristall Film, donde vas a poder ver
        tus compras y el estado de tu cuenta corriente.</p>
        <p>Para crear tu contraseña, entrá en este link:</p>
        <p><a href="${link}">${link}</a></p>
        <p>El link vence el ${expiresAt.toLocaleString("es-AR")} y se puede usar una sola vez.
        Si no lo pediste, ignorá este mensaje.</p>
        <p>— Equipo Kristall Film</p>
      `,
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "INVITE_PORTAL_ACCESS",
      entityType: "CLIENT",
      entityId: id,
      description: `Envió la invitación al portal a "${nombre}" (${contact.email})`,
      link: `/clients/${id}`,
    });

    return NextResponse.json({ ok: true, sentTo: contact.email, expiresAt });
  } catch (error) {
    log.error({ err: error }, "Error sending portal invite");
    return NextResponse.json({ error: "Error al enviar la invitación" }, { status: 500 });
  }
}
