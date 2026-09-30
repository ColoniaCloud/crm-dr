import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import type { PortalAccessLevel, PortalApiClient } from "@prisma/client";
/**
 * `prismaReal` y no `prisma`: las api keys viven SIEMPRE en la base real.
 *
 * Las rutas de demostración envuelven el handler entero, portero incluido.
 * Con el cliente por contexto, el portero buscaría la key en la base de demo
 * —donde no hay ninguna— y toda llamada del portal de demostración moriría
 * con «API key inválida».
 *
 * Y es lo correcto aparte del bug: una api key es infraestructura, no dato de
 * negocio. La base de demo no tiene credenciales propias ni tiene por qué
 * tenerlas.
 */
import { prisma, prismaReal } from "@/lib/prisma";
//
// Los dos clientes, y la diferencia importa:
//
//   prismaReal -> las api keys. Son infraestructura y viven en la base real.
//   prisma     -> las cuentas de portal. La cuenta de un clon de demostracion
//                 vive en la base de demo, asi que tiene que seguir el
//                 contexto del request. Si esta mirara la base real, el demo
//                 no podria autenticarse nunca.
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
    const client = await prismaReal.portalApiClient.findFirst({
      where: { id: cachedId, active: true },
    });
    // Si mientras tanto lo desactivaron, se cae al camino largo (que tampoco lo
    // va a encontrar): la caché acelera, no autoriza.
    if (client) {
      if (shouldTouchLastUsed(key)) {
        await prismaReal.portalApiClient.update({
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

  const clients = await prismaReal.portalApiClient.findMany({ where: { active: true } });
  for (const client of clients) {
    if (await bcrypt.compare(key, client.apiKeyHash)) {
      cacheVerifiedKey(key, client.id);
      await prismaReal.portalApiClient.update({
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

  // Sin `passwordHash` la cuenta está invitada pero sin activar, así que nunca
  // pudo haberse emitido una sesión para ella. Se trata igual que "no tiene
  // cuenta": falla cerrado.
  if (!account || !account.enabled || !account.passwordHash) {
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
 * Exige que la cuenta de portal esté habilitada y con **uno de los niveles**
 * que este endpoint acepta.
 *
 * Defensa en profundidad. La API confía en que kristall-web manda el
 * `contactId` del Cliente que realmente inició sesión — eso no cambia. Pero el
 * CRM además verifica de su lado que ese contacto tenga el nivel, en vez de
 * depender de que el sitio externo esconda los botones.
 *
 * ─── Por qué recibe una lista y no un nivel mínimo ─────────────────────────
 *
 * Porque los niveles **no son una escalera**. Cuando eran dos (BASIC e
 * INSTALLER) alcanzaba con "de acá para arriba", pero RESELLER está al costado:
 * comparte stock con INSTALLER y no comparte Mi Taller. Un "nivel mínimo" no
 * puede expresar eso, y el primer intento de forzarlo termina dándole el taller
 * a un revendedor o quitándole el stock.
 *
 * Así que cada endpoint dice qué niveles acepta:
 *
 * ```ts
 * await requireNivel(contactId, request, ["INSTALLER"]);              // Mi Taller
 * await requireNivel(contactId, request, ["INSTALLER", "RESELLER"]);  // Stock
 * ```
 *
 * Falla cerrado: sin cuenta de portal, deshabilitada, sin activar o con un nivel
 * que no está en la lista, se rechaza.
 */
export async function requireNivel(
  contactId: string,
  request: Request,
  niveles: readonly PortalAccessLevel[]
): Promise<{ success: true } | { success: false; response: NextResponse }> {
  const account = await prisma.clientPortalAccount.findUnique({
    where: { contactId },
    select: { enabled: true, accessLevel: true, passwordHash: true },
  });

  // `!passwordHash`: invitada y sin activar — ver requireEnabledPortalAccount.
  // Una cuenta puede estar invitada YA con su nivel puesto, y aun así no debe
  // pasar hasta que el Cliente elija su contraseña.
  if (
    !account ||
    !account.enabled ||
    !account.passwordHash ||
    !niveles.includes(account.accessLevel)
  ) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Este cliente no tiene habilitado ese nivel del portal" },
        { status: 403 }
      ),
    };
  }
  return checkCredentialVersion(request, account.passwordHash);
}

/**
 * Azúcar para los endpoints que son **solo** de instalador: Mi Taller,
 * instalaciones, sub-códigos y reclamos.
 *
 * Se mantiene con este nombre a propósito: en esos archivos dice qué son mejor
 * que `requireNivel(id, req, ["INSTALLER"])`. Para los que aceptan más de un
 * nivel —el stock, por ejemplo— usar `requireNivel` directamente.
 */
export async function requireInstallerLevel(
  contactId: string,
  request: Request
): Promise<{ success: true } | { success: false; response: NextResponse }> {
  return requireNivel(contactId, request, ["INSTALLER"]);
}
