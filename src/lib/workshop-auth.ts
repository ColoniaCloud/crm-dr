import { NextResponse } from "next/server";
import { requirePortalApiKey, requireInstallerLevel } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { findClientContact } from "@/lib/client-portal";

/**
 * Los cuatro chequeos que TODO endpoint de `/workshop/*` tiene que pasar, en un
 * solo lugar y en el orden correcto:
 *
 *   1. API key válida         → 401
 *   2. Rate limit por key     → 429
 *   3. El contacto existe y es tipo CLIENT → 404
 *   4. Nivel INSTALLER + la sesión sigue siendo válida → 403 / 401
 *
 * Existe porque el módulo de taller son 10 archivos de rutas y el preámbulo se
 * repetía entero en cada uno. Un preámbulo copiado 10 veces es un preámbulo del
 * que en algún momento alguien va a omitir un paso —y el paso que se omite
 * siempre es el 4, porque "total es un GET". No: la regla del plan (sección 4,
 * regla 2) es `requireInstallerLevel` en los 11 endpoints, GET incluidos.
 *
 * Las rutas del portal que ya existían siguen haciendo estos cuatro pasos a
 * mano. No las toqué en esta fase: cambiarlas es un refactor aparte, y mezclarlo
 * con endpoints nuevos hace ilegible el diff de los dos.
 *
 * Devuelve el `contactId` verificado. **Usar ese**, no el de la URL: son el
 * mismo string, pero pasar por acá deja explícito en cada query que el filtro
 * viene de un id ya validado.
 */
export async function requireWorkshopAccess(
  request: Request,
  contactId: string
): Promise<
  { success: true; contactId: string } | { success: false; response: NextResponse }
> {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return { success: false, response: gate.response };

  const rl = rateLimit(`portal-api:${gate.client.id}`, 300, 60_000);
  if (!rl.allowed) {
    return {
      success: false,
      response: NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 }),
    };
  }

  const contact = await findClientContact(contactId);
  if (!contact) {
    return {
      success: false,
      response: NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 }),
    };
  }

  const level = await requireInstallerLevel(contactId, request);
  if (!level.success) return { success: false, response: level.response };

  return { success: true, contactId };
}
