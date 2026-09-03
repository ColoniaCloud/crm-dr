import { NextResponse } from "next/server";
import { requirePublicSiteApiKey } from "@/lib/public-site-auth";
import { getPublicWorkshop } from "@/lib/workshop";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/public/workshop/by-handle/[handle]");

/**
 * La ficha publica de un taller, para renderizar su pagina en polariz.ar.
 *
 * Va con api key aunque el contenido sea publico: lo llama el servidor de
 * polariz.ar, no el navegador, y tener la key permite revocarlo o limitarlo sin
 * tocar el resto del CRM. La key **no** puede entrar al Panel de Clientes.
 *
 * **404 para el taller que no publico su pagina**, igual que para un handle
 * inexistente. Si respondieran distinto, cualquiera podria averiguar que
 * handles estan tomados probando de a uno.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const gate = await requirePublicSiteApiKey(request);
  if (!gate.success) return gate.response;

  // Por IP del sitio que llama y no por key: es un solo servidor, y el limite
  // esta para que un pico de trafico en la landing no se traduzca en un pico de
  // consultas contra la base.
  const rl = rateLimit(`psite-workshop:${clientIp(request)}`, 600, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const { handle } = await params;
    const taller = await getPublicWorkshop(handle.toLowerCase());
    if (!taller) {
      return NextResponse.json({ error: "Taller no encontrado" }, { status: 404 });
    }
    return NextResponse.json(taller);
  } catch (error) {
    log.error({ err: error }, "Error fetching public workshop");
    return NextResponse.json({ error: "Error al consultar el taller" }, { status: 500 });
  }
}
