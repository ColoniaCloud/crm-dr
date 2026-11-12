import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { requireRole } from "@/lib/api-auth";
import { WHATSAPP_ROLES } from "@/lib/whatsapp/access";
import { linesFor, type WhatsAppLine } from "@/lib/whatsapp/lines";

/**
 * El guardia de las rutas de WhatsApp que dependen de la línea: además del rol,
 * resuelve **con qué línea** trabaja el pedido.
 *
 * La línea llega en `?line=<key>`, pero solo se acepta si es una de las que esa
 * persona puede usar; sin el parámetro vale la suya por defecto. Así una pantalla
 * que no sabe de líneas (el botón de una lista, el modal de un contacto) sigue
 * andando, y nadie llega a una bandeja ajena cambiando la URL.
 */
export async function requireWhatsAppLine(
  request: Request
): Promise<
  | { success: true; session: Session; line: WhatsAppLine; lines: WhatsAppLine[] }
  | { success: false; response: NextResponse }
> {
  const gate = await requireRole(WHATSAPP_ROLES);
  if (!gate.success) return gate;

  const lines = linesFor(gate.session.user);
  const key = new URL(request.url).searchParams.get("line");
  const line = key ? lines.find((l) => l.key === key) : lines[0];
  if (!line) {
    return {
      success: false,
      response: NextResponse.json({ error: "No tenés acceso a esa línea de WhatsApp" }, { status: 403 }),
    };
  }
  return { success: true, session: gate.session, line, lines };
}
