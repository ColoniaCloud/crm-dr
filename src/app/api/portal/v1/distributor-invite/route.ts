import { NextResponse } from "next/server";
import { requirePortalApiKey } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { createLogger } from "@/lib/logger";
import { readInviteByToken } from "@/lib/distributor-invite";

const log = createLogger("api/portal/v1/distributor-invite");

/**
 * Lo que necesita /distribuidores-peru/<token> en kristall-web para saludar al
 * invitado: nombre y negocio. Nada más (ni teléfono ni mail: el link puede
 * haberse reenviado). Contar la visita es un efecto de esta lectura.
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

  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Falta el token" }, { status: 400 });

  try {
    const invite = await readInviteByToken(token);
    if (!invite) return NextResponse.json({ error: "La invitación no existe." }, { status: 404 });
    if (invite.revoked) return NextResponse.json({ error: "Esta invitación ya no está disponible." }, { status: 410 });
    return NextResponse.json({ name: invite.name, business: invite.business });
  } catch (error) {
    log.error({ err: error }, "Error leyendo la invitación");
    return NextResponse.json({ error: "No se pudo leer la invitación" }, { status: 500 });
  }
}
