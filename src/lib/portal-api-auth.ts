import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import type { PortalApiClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getCachedClientId,
  cacheVerifiedKey,
  shouldTouchLastUsed,
} from "@/lib/api-key-cache";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import {
  credentialVersionMatches,
} from "@/lib/portal-credentials";

const KEY_PREFIX = "capi_";

export function generatePortalApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
}

export function hashPortalApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, 10);
}

/**
 * Verifies the `x-api-key` header against active PortalApiClient records.
 * Returns the matching client (and bumps lastUsedAt) or null if invalid/missing.
 *
 * El camino caro (un `bcrypt.compare` por cliente activo) queda detrás de la
 * caché de aciertos y del límite sobre los fallos — ver lib/api-key-cache.ts.
 */
export async function verifyPortalApiKey(request: Request) {
  const key = request.headers.get("x-api-key");
  if (!key) return null;

  const cachedId = getCachedClientId(key);
  if (cachedId) {
    const client = await prisma.portalApiClient.findFirst({
      where: { id: cachedId, active: true },
    });
    // Si mientras tanto lo desactivaron, se cae al camino largo (que tampoco lo
    // va a encontrar): la caché acelera, no autoriza.
    if (client) {
      if (shouldTouchLastUsed(key)) {
        await prisma.portalApiClient.update({
          where: { id: client.id },
          data: { lastUsedAt: new Date() },
        });
      }
      return client;
    }
  }

  // Solo las keys que no están en caché llegan hasta acá, y un atacante manda
  // siempre keys distintas: el contador es efectivamente "intentos fallidos".
  const ip = clientIp(request);
  if (!rateLimit(`apikey-verify:${ip}`, 30, 60_000).allowed) return null;

  const clients = await prisma.portalApiClient.findMany({ where: { active: true } });
  for (const client of clients) {
    if (await bcrypt.compare(key, client.apiKeyHash)) {
      cacheVerifiedKey(key, client.id);
      await prisma.portalApiClient.update({
        where: { id: client.id },
        data: { lastUsedAt: new Date() },
      });
      return client;
    }
  }
  return null;
}

/**
 * Guards a /api/portal/v1 route. Returns the calling PortalApiClient on
 * success, or a ready-to-return NextResponse (401) on failure. Mirrors
 * requireRole's result shape from src/lib/api-auth.ts.
 */
export async function requirePortalApiKey(
  request: Request
): Promise<
  | { success: true; client: PortalApiClient }
  | { success: false; response: NextResponse }
> {
  const client = await verifyPortalApiKey(request);
  if (!client) {
    return {
      success: false,
      response: NextResponse.json({ error: "API key inválida" }, { status: 401 }),
    };
  }
  return { success: true, client };
}

/**
 * Exige que el Cliente tenga una cuenta de portal **habilitada**.
 *
 * `enabled: false` es el kill switch del admin: corta todo el portal, no solo
 * el nivel de instalador. Antes solo lo miraba `requireInstallerLevel`, así que
 * bajar el switch no cortaba nada de lo básico — perfil, cuenta corriente y
 * notificaciones seguían respondiendo hasta que venciera la sesión de
 * kristall-web, que dura 12 horas. Para un kill switch, esperar medio día no
 * sirve.
 *
 * Va en los endpoints de nivel BASIC. Los de instalador NO la necesitan:
 * `requireInstallerLevel` ya verifica `enabled` en la misma consulta.
 *
 * Falla cerrado: sin cuenta de portal, tampoco hay acceso.
 */
export async function requireEnabledPortalAccount(
  contactId: string,
  request: Request
): Promise<{ success: true } | { success: false; response: NextResponse }> {
  const account = await prisma.clientPortalAccount.findUnique({
    where: { contactId },
    select: { enabled: true, passwordHash: true },
  });

  if (!account || !account.enabled) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Este cliente no tiene acceso al portal" },
        { status: 403 }
      ),
    };
  }
  return checkCredentialVersion(request, account.passwordHash);
}

/**
 * 401 (no 403) si la sesión se emitió con una contraseña que ya no es la
 * vigente. Son cosas distintas y el consumidor las trata distinto: 403 es "no
 * tenés permiso", 401 es "esta sesión no vale más, volvé a entrar".
 * Ver lib/portal-credentials.ts.
 */
function checkCredentialVersion(
  request: Request,
  passwordHash: string
): { success: true } | { success: false; response: NextResponse } {
  if (credentialVersionMatches(request, passwordHash)) return { success: true };
  return {
    success: false,
    response: NextResponse.json(
      { error: "La sesión venció porque se cambió la contraseña" },
      { status: 401 }
    ),
  };
}

/**
 * Exige que el Cliente tenga nivel `INSTALLER` (stock, garantías, reclamos).
 *
 * Defensa en profundidad. La API confía en que kristall-web manda el
 * `contactId` del Cliente que realmente inició sesión — eso no cambia. Pero
 * ahora que cualquier Cliente puede tener cuenta, el CRM además verifica de su
 * lado que ese contacto tenga habilitado el segundo nivel, en vez de depender
 * solo de que el sitio externo esconda los botones.
 *
 * Falla cerrado: si el contacto no tiene cuenta de portal, o está deshabilitada,
 * o es BASIC, se rechaza.
 */
export async function requireInstallerLevel(
  contactId: string,
  request: Request
): Promise<{ success: true } | { success: false; response: NextResponse }> {
  const account = await prisma.clientPortalAccount.findUnique({
    where: { contactId },
    select: { enabled: true, accessLevel: true, passwordHash: true },
  });

  if (!account || !account.enabled || account.accessLevel !== "INSTALLER") {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Este cliente no tiene habilitado el portal de instalador" },
        { status: 403 }
      ),
    };
  }
  return checkCredentialVersion(request, account.passwordHash);
}
