import { NextResponse } from "next/server";
import { requirePortalApiKey } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { createLogger } from "@/lib/logger";
import { isInviteCountry, readInviteByToken } from "@/lib/distributor-invite";

const log = createLogger("api/portal/v1/distributor-invite");

/**
 * Lo que necesita la página de la propuesta en kristall-web para saludar al
 * invitado: nombre, negocio y país. Nada más (ni teléfono ni mail: el link puede
 * haberse reenviado). Contar la visita es un efecto de esta lectura.
 *
 * `for` (opcional) es el país de la ruta desde la que lee kristall-web. Si no es
 * el del invitado, la respuesta es `{ moved: true, country }` y no se cuenta la
 * visita: kristall-web redirige a la ruta de ese país y vuelve a leer.
 *
 * 404 si el token no existe; 410 si el link se revocó.
 */
export async function GET(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  // Tope por IP de origen: el token es aleatorio y no se puede adivinar, pero
  // cada intento cuesta una consulta.
  if (!rateLimit(`distributor-invite:${clientIp(request)}`, 120, 60_000).allowed) {
    return NextResponse.json({ error: "Demasiados pedidos" }, { status: 429 });
  }

  const query = new URL(request.url).searchParams;
  const token = query.get("token");
  const desde = query.get("for");
  if (!token) return NextResponse.json({ error: "Falta el token" }, { status: 400 });

  try {
    const invite = await readInviteByToken(token, isInviteCountry(desde) ? desde : undefined);
    if (!invite) return NextResponse.json({ error: "La invitación no existe." }, { status: 404 });
    if (invite.revoked) return NextResponse.json({ error: "Esta invitación ya no está disponible." }, { status: 410 });
    if (invite.moved) return NextResponse.json({ moved: true, country: invite.country });
    return NextResponse.json({ name: invite.name, business: invite.business, country: invite.country });
  } catch (error) {
    log.error({ err: error }, "Error leyendo la invitación");
    return NextResponse.json({ error: "No se pudo leer la invitación" }, { status: 500 });
  }
}
