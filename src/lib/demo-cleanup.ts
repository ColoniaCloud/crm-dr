import { enModoDemo } from "@/lib/demo-context";
import { borrarClonesViejos, HORAS_DE_VIDA } from "@/lib/demo-plantilla";
import { createLogger } from "@/lib/logger";

const log = createLogger("demo-cleanup");

/**
 * Junta los talleres de demostración vencidos.
 *
 * Sigue el patrón del resto del CRM —el poller de mails y el watcher de cuotas
 * vencidas— y no un cron externo: se arranca desde `instrumentation.ts` y corre
 * con un intervalo en proceso. No hay infraestructura de cron en este hosting, y
 * agregarla para esto sería una pieza más que mantener.
 *
 * El endpoint de sesión también limpia antes de crear, así que este watcher es
 * la red y no el mecanismo principal: si nadie entra a la demo en una semana,
 * igual no queda basura acumulada.
 *
 * Sin `DATABASE_URL_DEMO` no arranca. Instalar el portal de demostración es
 * opcional, y un watcher que tira cada seis horas porque le falta una variable
 * es ruido en los logs que enseña a ignorarlos.
 */

const INTERVALO_MS = 6 * 60 * 60 * 1000;

export function startDemoCleanup() {
  const g = globalThis as unknown as { __demoCleanupStarted?: boolean };
  if (g.__demoCleanupStarted) return;

  if (!process.env.DATABASE_URL_DEMO) {
    log.info("Sin DATABASE_URL_DEMO: no se arranca la limpieza de demostraciones");
    return;
  }

  g.__demoCleanupStarted = true;
  log.info({ intervalMs: INTERVALO_MS, horasDeVida: HORAS_DE_VIDA }, "Limpieza de demostraciones iniciada");

  const ciclo = () =>
    enModoDemo(() => borrarClonesViejos()).catch((err) =>
      log.error({ err }, "Fallo el ciclo de limpieza de demostraciones")
    );

  void ciclo();
  setInterval(ciclo, INTERVALO_MS);
}
