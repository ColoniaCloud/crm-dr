import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requirePortalApiKey } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { credentialVersion } from "@/lib/portal-credentials";

const log = createLogger("api/portal/v1/auth/login");

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => null);
  const validation = validateBody(loginSchema, json);
  if (!validation.success) return validation.response;
  const { email, password } = validation.data;

  // Throttle per (api client + email) to slow down credential stuffing/brute force.
  const rl = rateLimit(`portal-login:${gate.client.id}:${email.toLowerCase()}`, 5, 15 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Demasiados intentos. Esperá ${rl.retryAfter}s antes de reintentar.` },
      { status: 429 }
    );
  }

  try {
    const account = await prisma.clientPortalAccount.findUnique({
      where: { email },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, company: true, type: true } },
      },
    });

    // Generic error for "no account", "disabled" and "wrong password" alike —
    // never reveal which part failed, to avoid account enumeration.
    const invalid = NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });

    if (!account || !account.enabled || account.contact.type !== "CLIENT") {
      return invalid;
    }

    // Sin contraseña la cuenta está invitada pero sin activar: el Cliente nunca
    // eligió una. Se rechaza acá, antes de comparar nada, y con el mismo error
    // genérico que el resto — decir "esta cuenta todavía no se activó" le
    // confirmaría a cualquiera que ese email es cliente de Kristall.
    if (!account.passwordHash) {
      return invalid;
    }

    const passwordMatches = await bcrypt.compare(password, account.passwordHash);
    if (!passwordMatches) {
      return invalid;
    }

    await prisma.clientPortalAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });

    return NextResponse.json({
      contactId: account.contact.id,
      name: `${account.contact.firstName} ${account.contact.lastName}`,
      company: account.contact.company,
      // Con qué nivel entra: BASIC ve compras y cuenta corriente; INSTALLER suma
      // stock, garantías y reclamos. Guardalo en tu sesión para armar el menú.
      // El CRM igual lo verifica de su lado en cada endpoint de instalador.
      accessLevel: account.accessLevel,
      // Versión de la credencial con la que se emite esta sesión. Guardala y
      // mandala en `x-portal-credential-version` en cada llamada: cuando el
      // Cliente cambie la contraseña, el CRM responde 401 y la sesión se corta
      // sin esperar a que venza. Ver lib/portal-credentials.ts.
      credentialVersion: credentialVersion(account.passwordHash),
    });
  } catch (error) {
    log.error({ err: error }, "Error during portal login");
    return NextResponse.json({ error: "Error al iniciar sesión" }, { status: 500 });
  }
}
