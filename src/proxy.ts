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
    return NextResponse.redirect(loginUrl);
  }

  // Redirect unauthenticated users to login for page routes
  if (!req.auth && pathname !== "/login") {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
