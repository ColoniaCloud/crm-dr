import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { PortalTokenPurpose } from "@prisma/client";

/**
 * Tokens de un solo uso para que un Cliente active su cuenta del portal o
 * recupere su contraseña.
 *
 * A diferencia de las api keys (`lib/portal-api-auth.ts`), que se guardan con
 * bcrypt y obligan a recorrer todas las filas para verificar una, acá se usa
 * SHA-256: el token es aleatorio de 32 bytes, así que no hay nada que adivinar
 * por fuerza bruta y el hash permite buscar la fila directamente por índice.
 * Bcrypt sería más lento sin agregar seguridad real para este caso.
 *
 * El valor en claro solo existe en el mail que recibe el cliente; en la base
 * queda únicamente el hash.
 */

const VIGENCIA_MS: Record<PortalTokenPurpose, number> = {
  ACTIVATION: 24 * 60 * 60 * 1000, // 24 h — el cliente puede tardar en abrir el mail
  PASSWORD_RESET: 60 * 60 * 1000, //  1 h — ventana corta a propósito
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Genera un token, lo guarda hasheado y devuelve el valor en claro para meterlo
 * en el link del mail. Invalida los tokens anteriores del mismo propósito para
 * que un link viejo no siga sirviendo después de pedir uno nuevo.
 */
export async function issuePortalToken(params: {
  contactId: string;
  accountId?: string | null;
  purpose: PortalTokenPurpose;
  sentToEmail: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const { contactId, accountId, purpose, sentToEmail } = params;

  await prisma.portalAccessToken.updateMany({
    where: { contactId, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + VIGENCIA_MS[purpose]);

  await prisma.portalAccessToken.create({
    data: {
      contactId,
      accountId: accountId ?? null,
      tokenHash: hashToken(token),
      purpose,
      sentToEmail,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export type TokenLookup =
  | { ok: true; contactId: string; accountId: string | null; sentToEmail: string; tokenId: string }
  | { ok: false; reason: "NOT_FOUND" | "USED" | "EXPIRED" };

/** Valida un token sin consumirlo. Para mostrar el formulario antes de que el cliente lo envíe. */
export async function verifyPortalToken(
  token: string,
  purpose: PortalTokenPurpose
): Promise<TokenLookup> {
  const fila = await prisma.portalAccessToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!fila || fila.purpose !== purpose) return { ok: false, reason: "NOT_FOUND" };
  if (fila.usedAt) return { ok: false, reason: "USED" };
  if (fila.expiresAt < new Date()) return { ok: false, reason: "EXPIRED" };

  return {
    ok: true,
    contactId: fila.contactId,
    accountId: fila.accountId,
    sentToEmail: fila.sentToEmail,
    tokenId: fila.id,
  };
}

/** Marca el token como usado. Llamar dentro de la misma transacción que crea/actualiza la cuenta. */
export async function consumePortalToken(tokenId: string): Promise<void> {
  await prisma.portalAccessToken.update({
    where: { id: tokenId },
    data: { usedAt: new Date() },
  });
}

/** Base pública del portal de clientes (kristall-web), para armar los links de los mails. */
export function portalBaseUrl(): string {
  return (process.env.CLIENT_PORTAL_URL || "https://kristallfilm.com").replace(/\/$/, "");
}
