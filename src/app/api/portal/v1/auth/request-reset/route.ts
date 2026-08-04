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

const log = createLogger("api/portal/v1/auth/request-reset");

const schema = z.object({ email: z.string().email() });

/**
 * "Olvidé mi contraseña": manda el link para elegir una nueva.
 *
 * A diferencia del alta, la respuesta es **siempre la misma** exista o no la
 * cuenta. En el alta revelar que el email existe tiene un uso concreto (decirle
 * al cliente que puede seguir); acá no aporta nada, así que se usa el
 * comportamiento estándar de no confirmar qué emails están registrados.
 */
export async function POST(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(schema, json);
  if (!validation.success) return validation.response;
  const email = validation.data.email.trim();

  const rl = rateLimit(`portal-reset:${gate.client.id}:${email.toLowerCase()}`, 3, 15 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Demasiados intentos. Esperá ${rl.retryAfter}s antes de reintentar.` },
      { status: 429 }
    );
  }

  // Idéntica pase lo que pase — no confirma ni desmiente que el email exista.
  const generic = NextResponse.json({
    message: "Si ese email tiene una cuenta, te mandamos un link para cambiar la contraseña.",
  });

  try {
    const account = await prisma.clientPortalAccount.findUnique({
      where: { email },
      include: { contact: { select: { id: true, firstName: true, type: true } } },
    });

    if (!account || !account.enabled || account.contact.type !== "CLIENT") return generic;
    if (!isSmtpConfigured()) {
      log.error("SMTP not configured — cannot send reset email");
      return generic;
    }

    const { token, expiresAt } = await issuePortalToken({
      contactId: account.contact.id,
      accountId: account.id,
      purpose: "PASSWORD_RESET",
      sentToEmail: account.email,
    });

    const link = `${portalBaseUrl()}/cliente/nueva-clave/${token}`;
    await transporter.sendMail({
      from: FROM(),
      to: account.email,
      subject: "Cambiá tu contraseña — Panel de Clientes Kristall Film",
      html: `
        <p>Hola ${escapeHtml(account.contact.firstName)},</p>
        <p>Pediste cambiar la contraseña de tu Panel de Clientes. Elegí una nueva acá:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Vence el ${expiresAt.toLocaleString("es-AR")} y se usa una sola vez.
        Si no lo pediste, ignorá este mensaje: tu contraseña sigue igual.</p>
        <p>— Equipo Kristall Film</p>
      `,
    });

    return generic;
  } catch (error) {
    log.error({ err: error }, "Error requesting password reset");
    // Incluso ante un error interno se responde igual, para no filtrar por
    // diferencia de comportamiento si el email existe o no.
    return generic;
  }
}
