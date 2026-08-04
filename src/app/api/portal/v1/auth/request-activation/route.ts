import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePortalApiKey } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { transporter, isSmtpConfigured, FROM } from "@/lib/mailer";
import { escapeHtml } from "@/lib/notifications";
import { issuePortalToken, portalBaseUrl } from "@/lib/portal-tokens";

const log = createLogger("api/portal/v1/auth/request-activation");

const schema = z.object({ email: z.string().email() });

/**
 * Paso 1 del alta: el Cliente pone su email y, si coincide con el de su ficha en
 * el CRM, se le manda el mail para crear la contraseña.
 *
 * **Este endpoint revela si el email corresponde a un Cliente** (`found: true`).
 * Es una decisión de producto tomada a conciencia: el flujo pedido muestra en
 * pantalla "encontramos tu cuenta". A cambio, alguien podría probar emails para
 * saber quién es cliente de Kristall. Se mitiga con el límite de intentos de
 * abajo, y el impacto es bajo — son ~20 clientes B2B, no datos sensibles.
 * El endpoint de recuperación de contraseña sí es genérico.
 *
 * Solo entran contactos de tipo `CLIENT`. Un Lead con el mismo email no
 * califica, y un contacto `INSTALLER` tampoco (es otra actividad del CRM y
 * puede repetir email con un CLIENT — por eso el filtro es explícito).
 */
export async function POST(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(schema, json);
  if (!validation.success) return validation.response;
  const email = validation.data.email.trim();

  // Freno para que no se pueda barrer una lista de emails.
  const rl = rateLimit(`portal-activation:${gate.client.id}:${email.toLowerCase()}`, 3, 15 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Demasiados intentos. Esperá ${rl.retryAfter}s antes de reintentar.` },
      { status: 429 }
    );
  }

  try {
    const contacts = await prisma.contact.findMany({
      where: { type: "CLIENT", email },
      select: {
        id: true,
        firstName: true,
        email: true,
        portalAccount: { select: { id: true, activatedAt: true } },
      },
    });

    if (contacts.length === 0) {
      return NextResponse.json({
        found: false,
        message:
          "No encontramos una cuenta de cliente con ese email. Escribinos y lo damos de alta.",
      });
    }
    if (contacts.length > 1) {
      log.warn({ email }, "Multiple CLIENT contacts share this email");
      return NextResponse.json(
        {
          found: false,
          message: "Hay más de una ficha con ese email. Contactanos para resolverlo.",
        },
        { status: 409 }
      );
    }

    const contact = contacts[0];

    if (contact.portalAccount?.activatedAt) {
      return NextResponse.json({
        found: true,
        alreadyActive: true,
        message: "Esta cuenta ya está activa. Iniciá sesión, o usá «Olvidé mi contraseña».",
      });
    }

    if (!isSmtpConfigured()) {
      log.error("SMTP not configured — cannot send activation email");
      return NextResponse.json(
        { error: "No podemos enviar el mail en este momento. Probá más tarde." },
        { status: 503 }
      );
    }

    const { token, expiresAt } = await issuePortalToken({
      contactId: contact.id,
      accountId: contact.portalAccount?.id ?? null,
      purpose: "ACTIVATION",
      sentToEmail: contact.email!,
    });

    const link = `${portalBaseUrl()}/cliente/activar/${token}`;
    await transporter.sendMail({
      from: FROM(),
      to: contact.email!,
      subject: "Activá tu acceso al Panel de Clientes — Kristall Film",
      html: `
        <p>Hola ${escapeHtml(contact.firstName)},</p>
        <p>Recibimos un pedido para activar tu acceso al <strong>Panel de Clientes</strong>.</p>
        <p>Creá tu contraseña desde este link:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Vence el ${expiresAt.toLocaleString("es-AR")} y se usa una sola vez.
        Si no lo pediste, ignorá este mensaje.</p>
        <p>— Equipo Kristall Film</p>
      `,
    });

    return NextResponse.json({
      found: true,
      alreadyActive: false,
      message: "Encontramos tu cuenta. Te mandamos un mail para que crees tu contraseña.",
    });
  } catch (error) {
    log.error({ err: error }, "Error requesting activation");
    return NextResponse.json({ error: "Error al procesar el pedido" }, { status: 500 });
  }
}
