import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requirePortalApiKey } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { verifyPortalToken } from "@/lib/portal-tokens";

const log = createLogger("api/portal/v1/auth/reset");

const TOKEN_ERRORS: Record<string, { message: string; status: number }> = {
  NOT_FOUND: { message: "El link no es válido.", status: 404 },
  USED: { message: "Este link ya se usó. Pedí uno nuevo.", status: 410 },
  EXPIRED: { message: "El link venció. Pedí uno nuevo.", status: 410 },
};

/** Valida el link antes de mostrar el formulario de contraseña nueva. */
export async function GET(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Falta el token" }, { status: 400 });

  try {
    const lookup = await verifyPortalToken(token, "PASSWORD_RESET");
    if (!lookup.ok) {
      const e = TOKEN_ERRORS[lookup.reason];
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ valid: true, email: lookup.sentToEmail });
  } catch (error) {
    log.error({ err: error }, "Error verifying reset token");
    return NextResponse.json({ error: "Error al validar el link" }, { status: 500 });
  }
}

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "La contraseña tiene que tener al menos 8 caracteres"),
});

/**
 * Fija la contraseña nueva y consume el token.
 *
 * No devuelve sesión a propósito: después de cambiarla, el Cliente inicia
 * sesión por el camino normal. Así el link del mail nunca alcanza, por sí solo,
 * para quedar adentro de la cuenta.
 */
export async function POST(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const rl = rateLimit(`portal-reset-submit:${gate.client.id}`, 20, 15 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const validation = validateBody(resetSchema, json);
  if (!validation.success) return validation.response;
  const { token, password } = validation.data;

  try {
    const lookup = await verifyPortalToken(token, "PASSWORD_RESET");
    if (!lookup.ok) {
      const e = TOKEN_ERRORS[lookup.reason];
      return NextResponse.json({ error: e.message }, { status: e.status });
    }

    const account = await prisma.clientPortalAccount.findUnique({
      where: { contactId: lookup.contactId },
      select: { id: true, enabled: true },
    });
    if (!account || !account.enabled) {
      return NextResponse.json({ error: "El link no es válido." }, { status: 404 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.$transaction(async (tx) => {
      await tx.clientPortalAccount.update({
        where: { id: account.id },
        data: { passwordHash },
      });
      await tx.portalAccessToken.update({
        where: { id: lookup.tokenId },
        data: { usedAt: new Date() },
      });
    });

    return NextResponse.json({ ok: true, message: "Listo. Ya podés iniciar sesión." });
  } catch (error) {
    log.error({ err: error }, "Error resetting password");
    return NextResponse.json({ error: "Error al cambiar la contraseña" }, { status: 500 });
  }
}
