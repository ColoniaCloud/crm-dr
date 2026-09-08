import { NextResponse } from "next/server";
import { requirePortalApiKey } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { enModoDemo } from "@/lib/demo-context";
import {
  provisionarClonDemo,
  clonesVivos,
  borrarClonesViejos,
  MAX_CLONES_VIVOS,
} from "@/lib/demo-plantilla";
import { asegurarLimpiezaArrancada } from "@/lib/demo-cleanup";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/public/demo/session");

/**
 * Abre una sesión de demostración: crea un taller descartable y devuelve con
 * qué abrirle la cookie.
 *
 * **No hay autenticación nueva.** La sesión del portal es un token firmado que
 * lleva el `contactId`, y el CRM revalida ese id contra `ClientPortalAccount`
 * en cada endpoint. O sea que para meter a alguien en el portal alcanza con
 * emitir esa cookie apuntando al clon — no hace falta un usuario `demo` con
 * contraseña `demo`, ni tocar el login.
 *
 * Lo llama el servidor de kristall-web con su api key de portal, así que la
 * clave nunca sale al navegador. Es el mismo puente de siempre.
 */
export async function POST(request: Request) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  // Dos límites. El de IP frena a una persona que insiste; el tope de clones
  // vivos frena a un script, que no se cansa.
  if (!rateLimit(`demo-session:${clientIp(request)}`, 5, 60 * 60_000).allowed) {
    return NextResponse.json(
      { error: "Ya abriste varias demostraciones. Probá de nuevo en un rato." },
      { status: 429 }
    );
  }

  // Acá y no en `instrumentation.ts`: el watcher se arma en el primer uso real
  // de la demo, para no abrir la conexión a su base durante el arranque del
  // servidor. Es idempotente. Ver `demo-cleanup.ts`.
  asegurarLimpiezaArrancada();

  try {
    return await enModoDemo(async () => {
      // Antes de crear uno nuevo se junta lo viejo. Así el tope de abajo mide
      // sesiones de verdad y no basura acumulada, y la limpieza no depende
      // exclusivamente de que el cron haya corrido.
      await borrarClonesViejos().catch((err) => {
        log.error({ err }, "No se pudieron borrar los clones viejos");
      });

      if ((await clonesVivos()) >= MAX_CLONES_VIVOS) {
        return NextResponse.json(
          { error: "La demostración está ocupada en este momento. Probá en unos minutos." },
          { status: 503 }
        );
      }

      const clon = await provisionarClonDemo();
      return NextResponse.json(clon, { status: 201 });
    });
  } catch (error) {
    log.error({ err: error }, "Error provisionando la sesión de demostración");
    return NextResponse.json({ error: "No pudimos abrir la demostración" }, { status: 500 });
  }
}
