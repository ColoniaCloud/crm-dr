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
  // habilitación manual del segundo nivel: la hace un operador desde la ficha,
  // antes o después de que el cliente active — el nivel no depende de eso.
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

    // Crear y modificar son dos operaciones distintas, no una con dos ramas.
    //
    // Antes esto era un `upsert`, y traía un bug feo: el payload de `create`
    // llevaba `passwordHash: passwordHash as string` con `passwordHash` en
    // `null` cuando no se escribía contraseña. **Prisma valida el `create`
    // aunque después tome el camino de `update`**, así que rechazaba la
    // operación entera con "Argument `contact` is missing", y el catch de abajo
    // la devolvía como "Error al guardar el acceso al portal".
    //
    // Consecuencia: no se podía tocar NADA de una cuenta ya existente —ni el
    // nivel, ni el email, ni el switch de habilitado— sin escribirle además una
    // contraseña nueva al cliente. El kill switch del admin quedaba inservible
    // desde la pantalla.
    //
    // El `as string` era el que tapaba todo: sin ese cast, TypeScript no habría
    // dejado pasar un `null` en una columna que no lo admite.
    const proyeccion = { email: true, enabled: true, accessLevel: true } as const;

    let account;
    if (!existing) {
      // Alta a mano: acá sí hace falta la contraseña, porque la fila nace con
      // ella. El camino recomendado sigue siendo invitar al cliente.
      if (!password) {
        return NextResponse.json(
          { error: "La contraseña es requerida la primera vez" },
          { status: 400 }
        );
      }
      account = await prisma.clientPortalAccount.create({
        data: {
          contactId: id,
          email,
          passwordHash: await bcrypt.hash(password, 10),
          enabled: enabled ?? true,
          accessLevel: accessLevel ?? "BASIC",
        },
        select: proyeccion,
      });
    } else {
      // Modificación: la contraseña es opcional y, si no viene, no se toca.
      account = await prisma.clientPortalAccount.update({
        where: { contactId: id },
        data: {
          email,
          ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
          ...(enabled !== undefined ? { enabled } : {}),
          ...(accessLevel !== undefined ? { accessLevel } : {}),
        },
        select: proyeccion,
      });
    }

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
