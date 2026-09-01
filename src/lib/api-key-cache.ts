import { createHash } from "node:crypto";

/**
 * Caché en memoria para la verificación de API keys.
 *
 * El problema que resuelve: verificar una key hacía `findMany({active:true})` y
 * después un `bcrypt.compare` **por cada cliente activo**, en cada request. Con
 * bcrypt cost 10 eso son decenas de milisegundos de CPU por cliente registrado,
 * y el gate corre ANTES de cualquier limitador — así que mandar keys basura a un
 * endpoint público era amplificación de CPU gratis.
 *
 * Dos frenos, en este orden:
 *
 * 1. **Caché de aciertos.** Se guarda `sha256(key) → clientId` por unos minutos.
 *    El camino normal (kristall-web mandando siempre la misma key) deja de pagar
 *    bcrypt del todo. Se guarda el SHA-256, nunca la key en claro; y solo
 *    después de que bcrypt ya dijo que sí, así que no debilita nada.
 * 2. **Límite sobre los fallos.** Solo las keys que NO están en caché y NO
 *    verifican cuentan contra el límite. Un atacante manda siempre keys
 *    distintas, así que siempre falla y siempre cuenta; el cliente legítimo
 *    acierta y nunca toca el contador.
 *
 * En memoria, igual que `lib/rate-limit.ts`: se pierde en cada deploy y no se
 * comparte entre instancias. Para este uso alcanza — el peor caso es volver a
 * pagar un bcrypt.
 */

const TTL_MS = 5 * 60_000;

interface Entry {
  clientId: string;
  expiresAt: number;
  /** Para no escribir `lastUsedAt` en la base en cada request. */
  lastUsedWrittenAt: number;
}

const cache = new Map<string, Entry>();
let lastCleanup = Date.now();

export function fingerprint(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function cleanup(now: number) {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [k, e] of cache) if (now > e.expiresAt) cache.delete(k);
}

/** clientId si la key ya se verificó hace poco, null si hay que pasar por bcrypt. */
export function getCachedClientId(key: string): string | null {
  const now = Date.now();
  cleanup(now);
  const entry = cache.get(fingerprint(key));
  if (!entry || now > entry.expiresAt) return null;
  return entry.clientId;
}

export function cacheVerifiedKey(key: string, clientId: string): void {
  const now = Date.now();
  cache.set(fingerprint(key), {
    clientId,
    expiresAt: now + TTL_MS,
    lastUsedWrittenAt: now,
  });
}

/**
 * ¿Toca refrescar `lastUsedAt` en la base? Se escribe una vez por ventana de
 * caché en vez de una vez por request. La contra es que el `lastUsedAt` que se
 * ve en /settings puede estar hasta 5 minutos atrasado; sirve igual para lo que
 * se usa (saber si una key sigue viva), y ahorra un UPDATE por request.
 */
export function shouldTouchLastUsed(key: string): boolean {
  const entry = cache.get(fingerprint(key));
  if (!entry) return true;
  if (Date.now() - entry.lastUsedWrittenAt < TTL_MS) return false;
  entry.lastUsedWrittenAt = Date.now();
  return true;
}

/** Saca una key de la caché. Se usa al revocar/desactivar un cliente en /settings. */
export function invalidateCachedClient(clientId: string): void {
  for (const [k, e] of cache) if (e.clientId === clientId) cache.delete(k);
}
