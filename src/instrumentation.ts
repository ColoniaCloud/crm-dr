import * as Sentry from "@sentry/nextjs";

/**
 * Next llama a register() una vez al arrancar el servidor.
 *
 * Sentry solo se inicializa si hay DSN: sin él (desarrollo local, un entorno sin
 * variables) no se carga el SDK ni su instrumentación, y el CRM anda como antes.
 *
 * Importante: acá NO se abre ninguna conexión a base de datos. register() corre
 * antes de que exista un request, y abrir ahí una base secundaria rompió el
 * portal de demostración una vez; Sentry no necesita nada de eso.
 */
export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  // proxy.ts corre en Node en Next 16, así que no hace falta una config edge.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

// Errores de rutas y server components que nadie atrapó. Las rutas del CRM casi
// siempre atrapan con try/catch y loguean con pino: esos los cubre
// pinoIntegration en sentry.server.config.ts.
export const onRequestError = Sentry.captureRequestError;
