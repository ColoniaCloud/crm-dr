import { NextResponse } from "next/server";
import { verifyInstallationLogin } from "@/lib/warranty";
import { verifyWarrantyApiKey } from "@/lib/warranty-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/public/warranty/login");

// Server-to-server, exclusivamente desde el backend de kristall-web: sin CORS a
// propósito (ver lib/cors.ts). Antes llevaba `Allow-Origin: *`, lo que permitía
// llamarlo desde el navegador de cualquier sitio.
export async function POST(request: Request) {
  const client = await verifyWarrantyApiKey(request);
  if (!client) {
    return NextResponse.json({ error: "API key inválida" }, { status: 401 });
  }

  try {
    const { installationCode, password } = await request.json();
    if (typeof installationCode !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "installationCode y password son requeridos" }, { status: 400 });
    }

    // MySQL compara con utf8mb4_unicode_ci, o sea que `...-I1` y `...-i1` son la
    // MISMA instalación; el Map del limitador, en cambio, es case-sensitive. Sin
    // normalizar, cada variación de mayúsculas abría 5 intentos nuevos sobre la
    // misma garantía. `auth/login` del portal ya lo hacía así.
    const rl = rateLimit(
      `warranty-login:${client.id}:${installationCode.toLowerCase()}`,
      5,
      15 * 60_000
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Demasiados intentos. Esperá ${rl.retryAfter}s antes de reintentar.` },
        { status: 429 }
      );
    }

    const result = await verifyInstallationLogin(installationCode, password);
    if (!result) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    return NextResponse.json(result);
  } catch (error) {
    log.error({ err: error }, "Error during installation login");
    return NextResponse.json({ error: "Error al iniciar sesión" }, { status: 500 });
  }
}
