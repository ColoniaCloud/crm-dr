import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
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
 *
 * **Acepta el nivel de acceso.** Se puede invitar a alguien directamente como
 * `INSTALLER`, y cuando active su cuenta ya entra con el Portal Instalador
 * habilitado. Antes no se podía: la invitación no dejaba elegir nivel, el
 * Cliente activaba siempre en `BASIC`, y un operador tenía que acordarse de
 * volver a la ficha después para subirlo. Si nadie se acordaba, el instalador
 * entraba a un panel a medias y llamaba preguntando por su stock.
 *
 * Para que eso funcione, la invitación **crea la fila de la cuenta** con el
 * nivel elegido y sin contraseña (`passwordHash` es null hasta que el Cliente
 * elija la suya). La activación después completa la contraseña y **no pisa el
 * nivel**.
 */
const schema = z.object({
  accessLevel: z.enum(["BASIC", "INSTALLER"]).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  // Body opcional: sin él, la invitación es del nivel de siempre.
  const json = await request.json().catch(() => ({}));
  const validation = validateBody(schema, json ?? {});
  if (!validation.success) return validation.response;
  const accessLevel = validation.data.accessLevel ?? "BASIC";

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

    // La fila de la cuenta se crea acá, sin contraseña, para poder dejar el
    // nivel elegido de antemano. Mientras `passwordHash` sea null la cuenta no
    // puede iniciar sesión: el login la rechaza y los porteros del portal la
    // tratan como no activada.
    let account;
    try {
      account = contact.portalAccount
        ? await prisma.clientPortalAccount.update({
            where: { id: contact.portalAccount.id },
            data: { accessLevel },
            select: { id: true },
          })
        : await prisma.clientPortalAccount.create({
            data: {
              contactId: contact.id,
              email: contact.email,
              passwordHash: null,
              enabled: true,
              accessLevel,
            },
            select: { id: true },
          });
    } catch (error: unknown) {
      // El email del acceso es único en toda la tabla: si otro contacto ya lo
      // usa, hay que resolverlo a mano antes de poder invitar.
      if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
        return NextResponse.json(
          { error: "Ese email ya está en uso por el acceso al portal de otro cliente." },
          { status: 409 }
        );
      }
      throw error;
    }

    const { token, expiresAt } = await issuePortalToken({
      contactId: contact.id,
      accountId: account.id,
      purpose: "ACTIVATION",
      sentToEmail: contact.email,
    });

    const nombre = contact.company || `${contact.firstName} ${contact.lastName}`.trim();
    const link = `${portalBaseUrl()}/cliente/activar/${token}`;

    // El mail dice a qué entra, que no es lo mismo según el nivel. Prometerle
    // "compras y cuenta corriente" a un instalador que además va a tener stock,
    // garantías y su taller sería quedarse corto.
    const esInstalador = accessLevel === "INSTALLER";
    const panel = esInstalador ? "Portal Instalador" : "Panel de Clientes";
    const queVa = esInstalador
      ? `tus compras, tu cuenta corriente, el stock de tus rollos, las garantías que
        generás y la gestión de tu taller`
      : "tus compras y el estado de tu cuenta corriente";

    await transporter.sendMail({
      from: FROM(),
      to: contact.email,
      subject: `Activá tu acceso al ${panel} — Kristall Film`,
      html: `
        <p>Hola ${escapeHtml(contact.firstName)},</p>
        <p>Te damos acceso al <strong>${escapeHtml(panel)}</strong> de Kristall Film, donde vas a poder ver
        ${queVa}.</p>
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
      description: `Envió la invitación al portal a "${nombre}" (${contact.email}) — nivel ${accessLevel}`,
      link: `/clients/${id}`,
    });

    return NextResponse.json({ ok: true, sentTo: contact.email, expiresAt, accessLevel });
  } catch (error) {
    log.error({ err: error }, "Error sending portal invite");
    return NextResponse.json({ error: "Error al enviar la invitación" }, { status: 500 });
  }
}
