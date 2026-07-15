import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signMobileToken } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mobile/v1/auth/login");

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function OPTIONS() {
  return mobileCorsPreflight();
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const validation = validateBody(loginSchema, json);
  if (!validation.success) return withMobileCors(validation.response);
  const { email, password } = validation.data;

  // Throttle per email to slow down credential stuffing/brute force.
  const rl = rateLimit(`mobile-login:${email.toLowerCase()}`, 5, 15 * 60_000);
  if (!rl.allowed) {
    return withMobileCors(
      NextResponse.json(
        { error: `Demasiados intentos. Esperá ${rl.retryAfter}s antes de reintentar.` },
        { status: 429 }
      )
    );
  }

  try {
    const invalid = () =>
      withMobileCors(NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 }));

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt !== null) return invalid();

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) return invalid();

    const token = await signMobileToken({ sub: user.id, name: user.name, role: user.role });

    return withMobileCors(
      NextResponse.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatarUrl: user.avatarUrl,
        },
      })
    );
  } catch (error) {
    log.error({ err: error }, "Error during mobile login");
    return withMobileCors(NextResponse.json({ error: "Error al iniciar sesión" }, { status: 500 }));
  }
}
