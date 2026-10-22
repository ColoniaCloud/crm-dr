import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction, escapeHtml } from "@/lib/notifications";
import { transporter, isSmtpConfigured, FROM } from "@/lib/mailer";
import { issuePortalToken, portalBaseUrl } from "@/lib/portal-tokens";
import { WHERE_COMPRADOR } from "@/lib/contact-types";

const log = createLogger("api/clients/[id]/portal-access-reminder");

/**
 * "Reenviar acceso" para un Cliente que **ya activó** su cuenta y pregunta
 * cómo entrar. La invitación no sirve acá (es para elegir la primera
 * contraseña), así que se le manda un mail con el link de ingreso, el email
 * con el que entra y un link para elegir una contraseña nueva por si no se
 * acuerda.
 *
 * No toca la contraseña actual: si se acuerda, entra con ella y el link vence
 * solo. Es el mismo token que "Olvidé mi contraseña" (PASSWORD_RESET, 1 h).
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
      where: { id, ...WHERE_COMPRADOR },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        portalAccount: { select: { id: true, email: true, enabled: true, activatedAt: true } },
      },
    });
    if (!contact) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    const account = contact.portalAccount;
    if (!account?.activatedAt) {
      return NextResponse.json(
        { error: "Este cliente todavía no activó su cuenta: mandale la invitación." },
        { status: 409 }
      );
    }
    if (!account.enabled) {
      return NextResponse.json(
        { error: "El acceso al portal de este cliente está deshabilitado. Habilitalo primero." },
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
      accountId: account.id,
      purpose: "PASSWORD_RESET",
      sentToEmail: account.email,
    });

    const ingreso = `${portalBaseUrl()}/cliente/ingresar`;
    const nuevaClave = `${portalBaseUrl()}/cliente/nueva-clave/${token}`;

    await transporter.sendMail({
      from: FROM(),
      to: account.email,
      subject: "Cómo entrar a tu panel — Kristall Film",
      html: `
        <p>Hola ${escapeHtml(contact.firstName)},</p>
        <p>Te dejamos los datos para entrar a tu panel de Kristall Film:</p>
        <p>Ingresá en <a href="${ingreso}">${ingreso}</a> con tu email
        <strong>${escapeHtml(account.email)}</strong> y tu contraseña.</p>
        <p>Si no te acordás la contraseña, elegí una nueva en este link:</p>
        <p><a href="${nuevaClave}">${nuevaClave}</a></p>
        <p>Ese link vence el ${expiresAt.toLocaleString("es-AR")} y se usa una sola vez. Si vence, podés
        pedir otro con «Olvidé mi contraseña» en la pantalla de ingreso.</p>
        <p>— Equipo Kristall Film</p>
      `,
    });

    const nombre = contact.company || `${contact.firstName} ${contact.lastName}`.trim();
    await logOperatorAction({
      userId: session.user.id,
      action: "RESEND_PORTAL_ACCESS",
      entityType: "CLIENT",
      entityId: contact.id,
      description: `Le reenvió a "${nombre}" (${account.email}) los datos para entrar al portal`,
      link: `/clients/${contact.id}`,
    });

    return NextResponse.json({ ok: true, sentTo: account.email, expiresAt });
  } catch (error) {
    log.error({ err: error }, "Error reenviando el acceso al portal");
    return NextResponse.json({ error: "No se pudo enviar el mail" }, { status: 500 });
  }
}
