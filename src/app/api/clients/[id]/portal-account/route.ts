import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/clients/[id]/portal-account");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;

  try {
    const { id } = await params;
    const [account, contact] = await Promise.all([
      prisma.clientPortalAccount.findUnique({
        where: { contactId: id },
        select: {
          email: true,
          enabled: true,
          lastLoginAt: true,
          accessLevel: true,
          activatedAt: true,
          whatsapp: true,
          whatsappUpdatedAt: true,
        },
      }),
      prisma.contact.findUnique({ where: { id }, select: { email: true, whatsapp: true } }),
    ]);

    // El WhatsApp que el cliente carga en el portal NO pisa el del CRM. Si
    // difieren se le muestra al operador para que decida cuál vale.
    const whatsappMismatch =
      account?.whatsapp && contact?.whatsapp && account.whatsapp !== contact.whatsapp
        ? { portal: account.whatsapp, crm: contact.whatsapp, updatedAt: account.whatsappUpdatedAt }
        : null;

    return NextResponse.json({
      configured: Boolean(account),
      email: account?.email ?? null,
      enabled: account?.enabled ?? false,
      lastLoginAt: account?.lastLoginAt ?? null,
      accessLevel: account?.accessLevel ?? null,
      activatedAt: account?.activatedAt ?? null,
      whatsapp: account?.whatsapp ?? null,
      whatsappMismatch,
      // Sin email en la ficha no se le puede mandar la invitación.
      contactEmail: contact?.email ?? null,
      canInvite: Boolean(contact?.email),
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching portal account");
    return NextResponse.json({ error: "Error al cargar el acceso al portal" }, { status: 500 });
  }
}

const putSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).optional(),
  enabled: z.boolean().optional(),
  // BASIC lo obtiene cualquier Cliente que active su cuenta. INSTALLER es la
  // habilitación manual del segundo nivel y exige la cuenta ya activada.
  accessLevel: z.enum(["BASIC", "INSTALLER"]).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const json = await request.json().catch(() => null);
  const validation = validateBody(putSchema, json);
  if (!validation.success) return validation.response;
  const { email, password, enabled, accessLevel } = validation.data;

  try {
    const { id } = await params;
    const contact = await prisma.contact.findFirst({ where: { id, type: "CLIENT" }, select: { id: true, firstName: true, lastName: true, company: true } });
    if (!contact) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const existing = await prisma.clientPortalAccount.findUnique({ where: { contactId: id } });
    if (!password && !existing) {
      return NextResponse.json(
        { error: "La contraseña es requerida la primera vez" },
        { status: 400 }
      );
    }

    // Computed once: building the `create` object below always evaluates its
    // fields even when Prisma takes the `update` path, so calling bcrypt.hash
    // inline there would run (and, without a password, fail) on every rotation.
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const account = await prisma.clientPortalAccount.upsert({
      where: { contactId: id },
      create: {
        contactId: id,
        email,
        passwordHash: passwordHash as string,
        enabled: enabled ?? true,
        accessLevel: accessLevel ?? "BASIC",
      },
      update: {
        email,
        ...(passwordHash ? { passwordHash } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
        ...(accessLevel !== undefined ? { accessLevel } : {}),
      },
      select: { email: true, enabled: true, accessLevel: true },
    });

    const contactName = contact.company || `${contact.firstName} ${contact.lastName}`.trim();
    const cambioNivel =
      accessLevel !== undefined && accessLevel !== existing?.accessLevel
        ? ` — nivel ${accessLevel}`
        : "";
    await logOperatorAction({
      userId: session.user.id,
      action: "CONFIGURE_PORTAL_ACCESS",
      entityType: "CLIENT",
      entityId: id,
      description: `Configuró el acceso al portal (${account.email}) de "${contactName}"${cambioNivel}`,
      link: `/clients/${id}`,
    });

    return NextResponse.json(account);
  } catch (error: unknown) {
    log.error({ err: error }, "Error saving portal account");
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Ese email ya está en uso por otro acceso al portal" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error al guardar el acceso al portal" }, { status: 500 });
  }
}
