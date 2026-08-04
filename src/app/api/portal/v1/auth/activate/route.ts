import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requirePortalApiKey } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { notifyAdmins } from "@/lib/notifications";
import { verifyPortalToken } from "@/lib/portal-tokens";

const log = createLogger("api/portal/v1/auth/activate");

const TOKEN_ERRORS: Record<string, { message: string; status: number }> = {
  NOT_FOUND: { message: "El link no es válido.", status: 404 },
  USED: { message: "Este link ya se usó. Pedí uno nuevo.", status: 410 },
  EXPIRED: { message: "El link venció. Pedí uno nuevo.", status: 410 },
};

/**
 * Paso 2a: validar el link antes de mostrar el formulario.
 *
 * Devuelve además el WhatsApp que el CRM ya tiene cargado, para que el sitio
 * pueda preguntar "¿este número sigue siendo el tuyo?" en vez de pedirlo en
 * blanco. 18 de 22 clientes ya lo tienen cargado.
 */
export async function GET(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Falta el token" }, { status: 400 });
  }

  try {
    const lookup = await verifyPortalToken(token, "ACTIVATION");
    if (!lookup.ok) {
      const e = TOKEN_ERRORS[lookup.reason];
      return NextResponse.json({ error: e.message }, { status: e.status });
    }

    const contact = await prisma.contact.findFirst({
      where: { id: lookup.contactId, type: "CLIENT" },
      select: { firstName: true, lastName: true, company: true, whatsapp: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "El link no es válido." }, { status: 404 });
    }

    return NextResponse.json({
      valid: true,
      email: lookup.sentToEmail,
      name: `${contact.firstName} ${contact.lastName}`.trim(),
      company: contact.company,
      // null si el CRM no tiene número: en ese caso hay que pedirlo.
      whatsapp: contact.whatsapp || null,
    });
  } catch (error) {
    log.error({ err: error }, "Error verifying activation token");
    return NextResponse.json({ error: "Error al validar el link" }, { status: 500 });
  }
}

const activateSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "La contraseña tiene que tener al menos 8 caracteres"),
  whatsapp: z.string().min(6).max(30).optional(),
});

/**
 * Paso 2b: crear la cuenta con la contraseña que eligió el Cliente.
 *
 * Queda con nivel `BASIC` — el "Panel Clientes". El segundo nivel lo habilita
 * un operador desde el CRM, nunca este endpoint.
 *
 * El WhatsApp que carga acá **no pisa** el de la ficha: se guarda en la cuenta
 * del portal y, si difiere, se le avisa al operador para que decida cuál vale.
 * El número de la ficha puede ser el del local y este el personal — pisarlo en
 * silencio perdería un dato.
 */
export async function POST(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const rl = rateLimit(`portal-activate:${gate.client.id}`, 20, 15 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const validation = validateBody(activateSchema, json);
  if (!validation.success) return validation.response;
  const { token, password, whatsapp } = validation.data;

  try {
    const lookup = await verifyPortalToken(token, "ACTIVATION");
    if (!lookup.ok) {
      const e = TOKEN_ERRORS[lookup.reason];
      return NextResponse.json({ error: e.message }, { status: e.status });
    }

    const contact = await prisma.contact.findFirst({
      where: { id: lookup.contactId, type: "CLIENT" },
      select: { id: true, firstName: true, lastName: true, company: true, whatsapp: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "El link no es válido." }, { status: 404 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    const account = await prisma.$transaction(async (tx) => {
      const creado = await tx.clientPortalAccount.upsert({
        where: { contactId: contact.id },
        create: {
          contactId: contact.id,
          email: lookup.sentToEmail,
          passwordHash,
          enabled: true,
          accessLevel: "BASIC",
          activatedAt: now,
          ...(whatsapp ? { whatsapp, whatsappUpdatedAt: now } : {}),
        },
        update: {
          email: lookup.sentToEmail,
          passwordHash,
          enabled: true,
          activatedAt: now,
          ...(whatsapp ? { whatsapp, whatsappUpdatedAt: now } : {}),
        },
        select: { id: true, accessLevel: true },
      });

      await tx.portalAccessToken.update({
        where: { id: lookup.tokenId },
        data: { usedAt: now, accountId: creado.id },
      });

      return creado;
    });

    const nombre = contact.company || `${contact.firstName} ${contact.lastName}`.trim();

    // Si el número que cargó difiere del de la ficha, que un operador lo mire.
    if (whatsapp && contact.whatsapp && whatsapp !== contact.whatsapp) {
      await notifyAdmins({
        type: "PORTAL_WHATSAPP_MISMATCH",
        title: "Un cliente cargó otro WhatsApp",
        message: `${nombre} puso ${whatsapp} en el portal; en la ficha figura ${contact.whatsapp}. No se pisó nada.`,
        link: `/clients/${contact.id}`,
      });
    }

    await notifyAdmins({
      type: "PORTAL_ACCOUNT_ACTIVATED",
      title: "Cliente activó su acceso al portal",
      message: `${nombre} creó su contraseña y ya entra al Panel de Clientes.`,
      link: `/clients/${contact.id}`,
    });

    return NextResponse.json({
      contactId: contact.id,
      name: `${contact.firstName} ${contact.lastName}`.trim(),
      company: contact.company,
      accessLevel: account.accessLevel,
    });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Ese email ya está en uso por otra cuenta del portal. Contactanos." },
        { status: 409 }
      );
    }
    log.error({ err: error }, "Error activating portal account");
    return NextResponse.json({ error: "Error al activar la cuenta" }, { status: 500 });
  }
}
