import { randomBytes } from "node:crypto";
import { prismaReal } from "@/lib/prisma";
import { hashToken } from "@/lib/portal-tokens";
import { CREDENTIAL_VERSION_HEADER } from "@/lib/portal-credentials";

/**
 * "Entrar como el cliente": un operador del CRM abre el panel de un Cliente en
 * kristallfilm.com para configurárselo mientras le pregunta los datos por
 * WhatsApp, sin conocer ni inventar su contraseña. Al final le manda la
 * invitación de siempre y el Cliente elige la suya.
 *
 * El recorrido:
 *   1. La ficha pide un link (`issueSupportLink`). Vence en minutos y sirve
 *      una sola vez; el valor en claro solo existe en la pestaña que abre.
 *   2. kristall-web lo canjea por la API del portal (`redeemSupportLink`). La
 *      fila pasa a ser la sesión, con su propio vencimiento.
 *   3. La cookie del portal lleva `soporte:<id>` donde una sesión normal lleva
 *      la huella de la contraseña. Los porteros de portal-api-auth.ts la
 *      reconocen con `resolveSupportSession` y la dejan pasar aunque la cuenta
 *      todavía no tenga contraseña.
 *
 * `prismaReal` y no `prisma`: soporte es siempre sobre clientes reales, nunca
 * sobre los clones del portal de demostración.
 */

/** Cuánto tiene el operador para abrir el link después de pedirlo. */
const LINK_VIGENCIA_MS = 5 * 60 * 1000;
/** Cuánto dura la sesión ya abierta: una charla de WhatsApp larga, no un día. */
export const SESION_VIGENCIA_MS = 2 * 60 * 60 * 1000;

const PREFIJO = "soporte:";

export async function issueSupportLink(params: {
  contactId: string;
  userId: string;
  userName: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + LINK_VIGENCIA_MS);
  await prismaReal.portalSupportSession.create({
    data: {
      contactId: params.contactId,
      userId: params.userId,
      userName: params.userName,
      linkTokenHash: hashToken(token),
      linkExpiresAt: expiresAt,
    },
  });
  return { token, expiresAt };
}

export type RedeemResult =
  | { ok: true; sessionId: string; contactId: string; userName: string; expiresAt: Date }
  | { ok: false };

/**
 * Canjea el link por la sesión. El `updateMany` con `startedAt: null` es lo que
 * lo hace de un solo uso aun con dos pestañas abriéndolo a la vez: solo una
 * de las dos llega a cambiar la fila.
 */
export async function redeemSupportLink(token: string): Promise<RedeemResult> {
  const fila = await prismaReal.portalSupportSession.findUnique({
    where: { linkTokenHash: hashToken(token) },
  });
  if (!fila || fila.startedAt || fila.linkExpiresAt < new Date()) return { ok: false };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESION_VIGENCIA_MS);
  const res = await prismaReal.portalSupportSession.updateMany({
    where: { id: fila.id, startedAt: null },
    data: { startedAt: now, expiresAt },
  });
  if (res.count === 0) return { ok: false };

  return { ok: true, sessionId: fila.id, contactId: fila.contactId, userName: fila.userName, expiresAt };
}

/** Lo que kristall-web guarda en la cookie y manda en `x-portal-credential-version`. */
export function supportCredentialVersion(sessionId: string): string {
  return `${PREFIJO}${sessionId}`;
}

/**
 * Mira si el request viene de una sesión de soporte para este contacto.
 *
 * - `"none"`: es una sesión normal del Cliente; siguen los chequeos de siempre.
 * - `"valid"`: sesión de soporte vigente y del mismo contacto.
 * - `"invalid"`: dice ser de soporte pero venció, no existe o es de otro
 *   contacto. Se corta con 401, igual que una contraseña cambiada.
 */
export async function resolveSupportSession(
  request: Request,
  contactId: string
): Promise<"none" | "valid" | "invalid"> {
  const sent = request.headers.get(CREDENTIAL_VERSION_HEADER);
  if (!sent?.startsWith(PREFIJO)) return "none";

  const fila = await prismaReal.portalSupportSession.findUnique({
    where: { id: sent.slice(PREFIJO.length) },
    select: { contactId: true, expiresAt: true },
  });
  if (!fila || fila.contactId !== contactId || !fila.expiresAt || fila.expiresAt < new Date()) {
    return "invalid";
  }
  return "valid";
}
