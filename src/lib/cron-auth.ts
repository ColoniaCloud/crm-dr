import { NextResponse } from "next/server";
import crypto from "node:crypto";

/**
 * Portero de los endpoints que dispara el cron del hosting.
 *
 * Detrás de un `curl` de cron no hay sesión de NextAuth, así que la puerta es un
 * secreto compartido en `CRON_SECRET`. Sin esa variable el endpoint no abre:
 * preferimos que el cron falle ruidosamente a dejar una ruta que corre trabajos
 * de fondo sin credencial.
 */
export function requireCronSecret(
  req: Request
): { success: true } | { success: false; response: NextResponse } {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) {
    return {
      success: false,
      response: NextResponse.json({ error: "CRON_SECRET no está configurado" }, { status: 503 }),
    };
  }

  const recibido = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  // timingSafeEqual explota si los largos difieren, así que hay que compararlos
  // antes. Eso filtra el largo del secreto y no hay forma de evitarlo.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return {
      success: false,
      response: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }

  return { success: true };
}
