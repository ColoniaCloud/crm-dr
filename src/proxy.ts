import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: "Demasiadas peticiones. Intente de nuevo más tarde." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/**
 * Ningún documento de la app puede quedar guardado en una caché compartida.
 *
 * Next marca las páginas prerenderizadas con `Cache-Control: s-maxage=31536000`
 * —un año— porque da por sentado que adelante hay una CDN que se purga sola en
 * cada deploy. Eso es cierto en Vercel; acá no. Corremos bajo Passenger desde
 * `hbuilds/`, que se reconstruye entero en cada deploy sin purgar nada, así que
 * el HTML viejo sobrevive en la caché de adelante y sigue pidiendo chunks con
 * hash que ya no existen: 404 en el CSS y el login se ve sin estilos.
 *
 * `private` deja afuera a las cachés compartidas, que son las que provocan el
 * problema. `max-age=0, must-revalidate` deja que el navegador igual guarde el
 * documento, pero lo obliga a revalidarlo antes de usarlo; como Next manda
 * ETag, eso se resuelve con un 304 en vez de reenviar el HTML entero.
 *
 * OJO: acá `no-cache` NO es equivalente aunque lo parezca. Con `no-cache` Next
 * deja de responder 304 a los `If-None-Match` y reenvía el documento completo
 * cada vez (medido: 200 con `no-cache`, 304 con `max-age=0`). Mismo efecto
 * sobre las cachés compartidas, pero se pierde la revalidación barata.
 *
 * Solo aplica a documentos (HTML y payloads RSC). Los assets de
 * `/_next/static/*` quedan fuera del matcher de abajo y conservan su
 * `immutable`, que es correcto porque sus nombres llevan hash de contenido.
 */
const DOCUMENT_CACHE_CONTROL = "private, max-age=0, must-revalidate";

function noSharedCache<T extends NextResponse>(res: T): T {
  res.headers.set("Cache-Control", DOCUMENT_CACHE_CONTROL);
  return res;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // --- Rate limiting for specific API routes ---
  if (pathname.startsWith("/api/")) {
    const ip = getClientIp(req);

    // POST /api/auth/* → 10 req/min per IP (brute-force protection)
    if (method === "POST" && pathname.startsWith("/api/auth")) {
      const rl = rateLimit(`auth:${ip}`, 10, 60_000);
      if (!rl.allowed) return tooMany(rl.retryAfter);
    }

    // POST /api/quotes/*/send → 5 req/min per IP (email spam protection)
    if (method === "POST" && /^\/api\/quotes\/[^/]+\/send$/.test(pathname)) {
      const rl = rateLimit(`quote-send:${ip}`, 5, 60_000);
      if (!rl.allowed) return tooMany(rl.retryAfter);
    }

    // POST /api/leads/import → 3 req/5min per IP (import abuse protection)
    if (method === "POST" && pathname === "/api/leads/import") {
      const rl = rateLimit(`leads-import:${ip}`, 3, 300_000);
      if (!rl.allowed) return tooMany(rl.retryAfter);
    }

    // GET /api/ai/* → 10 req/hour per user (AI cost control)
    if (method === "GET" && pathname.startsWith("/api/ai")) {
      const userId = req.auth?.user?.id || ip;
      const rl = rateLimit(`ai:${userId}`, 10, 3_600_000);
      if (!rl.allowed) return tooMany(rl.retryAfter);
    }

    return NextResponse.next();
  }

  // Invalidated sessions (JWT revalidation cleared token) → redirect to login
  if (req.auth && !req.auth.user?.id) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return noSharedCache(NextResponse.redirect(loginUrl));
  }

  // Redirect unauthenticated users to login for page routes
  if (!req.auth && pathname !== "/login") {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return noSharedCache(NextResponse.redirect(loginUrl));
  }

  return noSharedCache(NextResponse.next());
});

export const config = {
  // Los archivos estáticos de `public/` quedan fuera del proxy.
  //
  // Antes solo se excluían `_next/*` y `favicon.ico`, así que todo lo demás en
  // `public/` caía en el redirect a /login de más abajo. Eso rompía el logo del
  // propio login (el optimizador de imágenes pide /logo-blanco.png, recibía un
  // 307 a HTML y respondía 400 "isn't a valid image"), y de paso dejaba
  // robots.txt, el manifest y los iconos de la PWA inaccesibles sin sesión.
  //
  // Excluir por extensión es seguro: ninguna ruta de la app termina en una de
  // estas, así que no se destapa nada que estuviera protegido.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|gif|webp|svg|ico|txt|xml|webmanifest)$).*)",
  ],
};
