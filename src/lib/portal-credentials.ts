import { createHash } from "node:crypto";

/**
 * Huella de la credencial actual de una cuenta del portal.
 *
 * El problema: la sesión de kristall-web es un token **stateless** (firma +
 * vencimiento, nada más), así que una cookie robada sigue entrando durante 12 h
 * aunque el Cliente ya haya cambiado la contraseña. Cambiarla no cortaba nada;
 * el "cerrar sesión" solo borra la cookie del navegador de quien la aprieta.
 *
 * La solución sin agregar columnas ni una tabla de sesiones: derivar una
 * versión de la propia contraseña. El `passwordHash` de bcrypt cambia entero
 * cada vez que se setea una contraseña (sal nueva), así que su SHA-256 sirve de
 * número de versión. kristall-web lo guarda en la cookie firmada al iniciar
 * sesión y lo manda en cada llamada; el CRM lo compara contra el valor de ahora
 * y, si no coincide, la sesión ya no vale.
 *
 * Se devuelve un recorte de 16 caracteres hex: es un identificador de versión,
 * no un secreto — pero igual conviene que no sea el hash completo, porque eso
 * sería un derivado directo del hash de la contraseña viajando en una cabecera.
 */
export function credentialVersion(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

/** Nombre de la cabecera con la que kristall-web manda la versión de su sesión. */
export const CREDENTIAL_VERSION_HEADER = "x-portal-credential-version";

/**
 * Compara la versión que trae el request contra la de la cuenta.
 *
 * Si el request NO trae la cabecera se acepta: las sesiones emitidas antes de
 * agosto 2026 no la tienen y vencen solas dentro de las 12 h. Mismo criterio
 * que `accessLevel` cuando se agregaron los niveles. Cuando no queden sesiones
 * viejas dando vueltas, esto puede pasar a exigir la cabecera.
 */
export function credentialVersionMatches(
  request: Request,
  passwordHash: string
): boolean {
  const sent = request.headers.get(CREDENTIAL_VERSION_HEADER);
  if (!sent) return true;
  return sent === credentialVersion(passwordHash);
}
