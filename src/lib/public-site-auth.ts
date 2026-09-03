import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import type { PublicSiteApiClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

/**
 * Auth de los sitios publicos que consumen datos de talleres.
 *
 * Calcado de `portal-api-auth.ts` y a proposito separado: esta key puede leer
 * talleres publicados y crear pedidos de turno, pero **no** entra al Panel de
 * Clientes. Tenerlas aparte permite revocar polariz.ar sin dejar sin portal a
 * kristallfilm.com — que es justo el escenario para el que uno quiere poder
 * revocar algo.
 */

const KEY_PREFIX = "psite_";

export function generatePublicSiteApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
}

export function hashPublicSiteApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, 10);
}

/**
 * Verifica el header `x-api-key`.
 *
 * Sin la cache de aciertos que tiene la API del portal: estos endpoints los
 * llama un solo servidor y con muchisimo menos volumen. Lo que si se mantiene
 * es el limite sobre los fallos, porque el camino caro es un `bcrypt.compare`
 * por cliente activo y un atacante manda siempre keys distintas.
 */
export async function verifyPublicSiteApiKey(request: Request) {
  const key = request.headers.get("x-api-key");
  if (!key) return null;

  const ip = clientIp(request);
  if (!rateLimit(`psite-verify:${ip}`, 30, 60_000).allowed) return null;

  const clients = await prisma.publicSiteApiClient.findMany({ where: { active: true } });
  for (const client of clients) {
    if (await bcrypt.compare(key, client.apiKeyHash)) {
      await prisma.publicSiteApiClient.update({
        where: { id: client.id },
        data: { lastUsedAt: new Date() },
      });
      return client;
    }
  }
  return null;
}

export async function requirePublicSiteApiKey(
  request: Request
): Promise<
  | { success: true; client: PublicSiteApiClient }
  | { success: false; response: NextResponse }
> {
  const client = await verifyPublicSiteApiKey(request);
  if (!client) {
    return {
      success: false,
      response: NextResponse.json({ error: "API key invalida" }, { status: 401 }),
    };
  }
  return { success: true, client };
}
