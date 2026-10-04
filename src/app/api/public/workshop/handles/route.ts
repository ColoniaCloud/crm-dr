import { NextResponse } from "next/server";
import { requirePublicSiteApiKey } from "@/lib/public-site-auth";
import { listPublishedWorkshopHandles } from "@/lib/workshop";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/public/workshop/handles");

/**
 * Los handles de los talleres con página publicada, para que polariz.ar arme
 * su sitemap y Google encuentre cada página sin depender de que alguien la
 * enlace.
 *
 * Misma api key y mismo criterio que `by-handle`: solo lo publicado. No tiene
 * espejo en `/api/public/demo/`: los talleres de demostración no se indexan.
 */
export async function GET(request: Request) {
  const gate = await requirePublicSiteApiKey(request);
  if (!gate.success) return gate.response;

  const rl = rateLimit(`psite-handles:${clientIp(request)}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    return NextResponse.json({ talleres: await listPublishedWorkshopHandles() });
  } catch (error) {
    log.error({ err: error }, "Error listing published workshops");
    return NextResponse.json({ error: "Error al listar los talleres" }, { status: 500 });
  }
}
