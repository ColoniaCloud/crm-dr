/**
 * In-memory rate limiter using fixed-window counters.
 *
 * Elegido por ser zero-dependency y compatible con Edge Runtime (Next.js middleware).
 * No requiere Redis. Funciona bien para despliegues single-instance (Hostinger, VPS).
 * En serverless (Vercel), protege durante la vida de cada instancia pero no comparte
 * estado entre instancias — suficiente para frenar abuso común.
 *
 * Para escalar a múltiples instancias, migrar a @upstash/ratelimit + Redis.
 */

const store = new Map<string, { count: number; resetAt: number }>();

// Clean expired entries every 60s to prevent memory leaks
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60_000;

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfter: number } {
  cleanup();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true, retryAfter: 0 };
}
