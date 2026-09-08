import { enModoDemo } from "@/lib/demo-context";
import { borrarClonesViejos, HORAS_DE_VIDA } from "@/lib/demo-plantilla";
import { createLogger } from "@/lib/logger";

const log = createLogger("demo-cleanup");

/**
 * Junta los talleres de demostración vencidos.
 *
 * Sigue el patrón del resto del CRM —el poller de mails y el watcher de cuotas
 * vencidas— y no un cron externo: corre con un intervalo en proceso. No hay
 * infraestructura de cron en este hosting, y agregarla para esto sería una
 * pieza más que mantener.
 *
 * El endpoint de sesión también limpia antes de crear, así que este watcher es
 * la red y no el mecanismo principal.
 *
 * ─── Por qué NO arranca desde `instrumentation.ts` ─────────────────────────
 *
 * Porque arrancarlo en el boot abre la conexión a la base de demostración
 * antes de atender el primer request, y eso anula que el cliente de demo sea
 * perezoso (ver `prisma.ts`). El 2026-09-07 el CRM se quedó sin responder
 * después de mergear esto, y esta era la única pieza que corría antes del
 * primer request. Nunca se pudo confirmar la causa —el log de runtime se
 * perdió en el reinicio— pero el arranque no es lugar para abrir una segunda
 * pila de conexiones contra un MySQL compartido.
 *
 * Se arma en el primer uso real de la demo, desde el endpoint de sesión. Si
 * nadie entra a la demo, no hay clones que juntar y el watcher no hace falta.
 */

const INTERVALO_MS = 6 * 60 * 60 * 1000;

/**
 * Arranca el watcher si todavía no estaba. Idempotente y barato: llamalo sin
 * miedo en cada request de demo.
 */
export function asegurarLimpiezaArrancada() {
  const g = globalThis as unknown as { __demoCleanupStarted?: boolean };
  if (g.__demoCleanupStarted) return;

  if (!process.env.DATABASE_URL_DEMO) {
    log.info("Sin DATABASE_URL_DEMO: no se arranca la limpieza de demostraciones");
    return;
  }

  if (process.env.DEMO_CLEANUP_DISABLED === "true") {
    log.info("DEMO_CLEANUP_DISABLED: no se arranca la limpieza de demostraciones");
    return;
  }

  g.__demoCleanupStarted = true;
  log.info({ intervalMs: INTERVALO_MS, horasDeVida: HORAS_DE_VIDA }, "Limpieza de demostraciones iniciada");

  const ciclo = () =>
    enModoDemo(() => borrarClonesViejos()).catch((err) =>
      log.error({ err }, "Fallo el ciclo de limpieza de demostraciones")
    );

  // Sin ciclo inmediato: quien nos llama ya limpia antes de crear su clon.
  setInterval(ciclo, INTERVALO_MS);
}
