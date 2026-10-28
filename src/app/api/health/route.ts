import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/health");

/**
 * Chequeo de salud para el monitor de uptime (Uptime Kuma, UptimeRobot…).
 *
 * Público a propósito: el monitor no tiene sesión, y `proxy.ts` deja pasar todo
 * `/api/*` sin redirigir al login. Por eso no devuelve nada que ayude a alguien
 * de afuera —ni versiones ni mensajes de error—: solo «ok» o «caída» por
 * componente. El detalle queda en el log.
 *
 * Solo mide lo que el CRM necesita para funcionar: la base. WhatsApp, SMTP y el
 * poller de mail se monitorean aparte, porque que caigan no tumba el CRM y no
 * deberían ponerlo en rojo.
 */
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 5000;

function conTimeout<T>(promesa: Promise<T>): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error("timeout")), TIMEOUT_MS)),
  ]);
}

export async function GET() {
  let db: "ok" | "caida" = "ok";
  try {
    // Sin contexto de demostración, `prisma` resuelve contra la base real.
    await conTimeout(prisma.$queryRaw`SELECT 1`);
  } catch (err) {
    db = "caida";
    log.error({ err }, "la base no responde");
  }

  const ok = db === "ok";
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", checks: { db }, uptimeSeconds: Math.round(process.uptime()) },
    // 503 y no 200: los monitores deciden por el código de estado.
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
