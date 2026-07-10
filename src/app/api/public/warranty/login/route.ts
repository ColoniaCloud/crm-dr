import { NextResponse } from "next/server";
import { verifyInstallationLogin } from "@/lib/warranty";
import { verifyWarrantyApiKey } from "@/lib/warranty-api-auth";
import { withCors, corsPreflight } from "@/lib/cors";
import { rateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/public/warranty/login");

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const client = await verifyWarrantyApiKey(request);
  if (!client) {
    return withCors(NextResponse.json({ error: "API key inválida" }, { status: 401 }));
  }

  try {
    const { installationCode, password } = await request.json();
    if (typeof installationCode !== "string" || typeof password !== "string") {
      return withCors(
        NextResponse.json({ error: "installationCode y password son requeridos" }, { status: 400 })
      );
    }

    const rl = rateLimit(`warranty-login:${client.id}:${installationCode}`, 5, 15 * 60_000);
    if (!rl.allowed) {
      return withCors(
        NextResponse.json(
          { error: `Demasiados intentos. Esperá ${rl.retryAfter}s antes de reintentar.` },
          { status: 429 }
        )
      );
    }

    const result = await verifyInstallationLogin(installationCode, password);
    if (!result) {
      return withCors(NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 }));
    }

    return withCors(NextResponse.json(result));
  } catch (error) {
    log.error({ err: error }, "Error during installation login");
    return withCors(NextResponse.json({ error: "Error al iniciar sesión" }, { status: 500 }));
  }
}
