import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import type { PortalApiClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
 */
export async function verifyPortalApiKey(request: Request) {
  const key = request.headers.get("x-api-key");
  if (!key) return null;

  const clients = await prisma.portalApiClient.findMany({ where: { active: true } });
  for (const client of clients) {
    if (await bcrypt.compare(key, client.apiKeyHash)) {
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
  contactId: string
): Promise<{ success: true } | { success: false; response: NextResponse }> {
  const account = await prisma.clientPortalAccount.findUnique({
    where: { contactId },
    select: { enabled: true, accessLevel: true },
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
  return { success: true };
}
