import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { AppRole } from "@/lib/api-auth";

const TOKEN_TTL = "8h";

function getSecret(): Uint8Array {
  const secret = process.env.MOBILE_API_JWT_SECRET;
  if (!secret) {
    throw new Error("MOBILE_API_JWT_SECRET no está configurado");
  }
  return new TextEncoder().encode(secret);
}

export type MobileTokenPayload = {
  sub: string;
  name: string;
  role: AppRole;
};

export async function signMobileToken(payload: MobileTokenPayload): Promise<string> {
  return new SignJWT({ name: payload.name, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getSecret());
}

async function verifyMobileToken(token: string): Promise<MobileTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub || typeof payload.name !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return { sub: payload.sub, name: payload.name, role: payload.role as AppRole };
  } catch {
    return null;
  }
}

/**
 * Guards a /api/mobile/v1 route. Mirrors requireRole's result shape from
 * src/lib/api-auth.ts, but verifies a bearer JWT (issued by
 * /api/mobile/v1/auth/login) instead of a NextAuth cookie session — the
 * mobile PWA is served from a different origin, so it can't rely on the
 * dashboard's httpOnly session cookie.
 */
export async function requireMobileAuth(
  request: Request,
  roles?: AppRole[]
): Promise<
  | { success: true; user: MobileTokenPayload }
  | { success: false; response: NextResponse }
> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) {
    return {
      success: false,
      response: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }

  const user = await verifyMobileToken(token);
  if (!user) {
    return {
      success: false,
      response: NextResponse.json({ error: "Token inválido o vencido" }, { status: 401 }),
    };
  }

  if (roles && !roles.includes(user.role)) {
    return {
      success: false,
      response: NextResponse.json({ error: "Acceso restringido" }, { status: 403 }),
    };
  }

  return { success: true, user };
}
