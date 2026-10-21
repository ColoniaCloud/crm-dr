import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { portalBaseUrl } from "@/lib/portal-tokens";
import { issueSupportLink } from "@/lib/portal-support";
import { WHERE_COMPRADOR } from "@/lib/contact-types";

const log = createLogger("api/clients/[id]/portal-support");

/**
 * "Entrar como el cliente": devuelve el link de un solo uso que abre el panel
 * de este Cliente en kristallfilm.com, para configurárselo sin tocar su
 * contraseña. Ver lib/portal-support.ts.
 *
 * Si el Cliente todavía no tiene cuenta, la crea igual que la invitación: sin
 * contraseña y con el nivel elegido en la ficha. Así, cuando después se le
 * manda la invitación, activa sobre el panel que ya le dejaron armado.
 */
const schema = z.object({
  accessLevel: z.enum(["BASIC", "INSTALLER", "RESELLER"]).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const json = await request.json().catch(() => ({}));
  const validation = validateBody(schema, json ?? {});
  if (!validation.success) return validation.response;

  try {
    const { id } = await params;

    const contact = await prisma.contact.findFirst({
      where: { id, ...WHERE_COMPRADOR },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        email: true,
        portalAccount: { select: { id: true, enabled: true, activatedAt: true, accessLevel: true } },
      },
    });
    if (!contact) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const account = contact.portalAccount;
    if (account && !account.enabled) {
      return NextResponse.json(
        { error: "El acceso al portal de este cliente está deshabilitado. Habilitalo primero." },
        { status: 409 }
      );
    }

    if (!account) {
      // El email de la cuenta es el del login: sin él no hay a quién mandarle
      // la invitación del final.
      if (!contact.email) {
        return NextResponse.json(
          { error: "Este cliente no tiene email en la ficha. Pedíselo y cargalo antes de entrar a su panel." },
          { status: 400 }
        );
      }
      try {
        await prisma.clientPortalAccount.create({
          data: {
            contactId: contact.id,
            email: contact.email,
            passwordHash: null,
            enabled: true,
            accessLevel: validation.data.accessLevel ?? "BASIC",
          },
        });
      } catch (error: unknown) {
        if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
          return NextResponse.json(
            { error: "Ese email ya está en uso por el acceso al portal de otro cliente." },
            { status: 409 }
          );
        }
        throw error;
      }
    } else if (!account.activatedAt && validation.data.accessLevel && validation.data.accessLevel !== account.accessLevel) {
      // Igual que la invitación: mientras no activó, el nivel elegido en la
      // ficha es el que vale. Si ya activó, el nivel se cambia con "Guardar".
      await prisma.clientPortalAccount.update({
        where: { id: account.id },
        data: { accessLevel: validation.data.accessLevel },
      });
    }

    const { token, expiresAt } = await issueSupportLink({
      contactId: contact.id,
      userId: session.user.id,
      userName: session.user.name || session.user.email || "Kristall Film",
    });

    const nombre = contact.company || `${contact.firstName} ${contact.lastName}`.trim();
    await logOperatorAction({
      userId: session.user.id,
      action: "PORTAL_SUPPORT_LOGIN",
      entityType: "CLIENT",
      entityId: contact.id,
      description: `Entró al panel del portal de "${nombre}" como el cliente, para configurarlo`,
      link: `/clients/${contact.id}`,
    });

    return NextResponse.json({ url: `${portalBaseUrl()}/cliente/soporte/${token}`, expiresAt });
  } catch (error) {
    log.error({ err: error }, "Error generando el link de soporte");
    return NextResponse.json({ error: "No se pudo generar el link para entrar al panel" }, { status: 500 });
  }
}
