import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  // Solo errores: el tracing de rendimiento consume cuota y memoria.
  tracesSampleRate: 0,
  // Sin IPs, cookies ni cabeceras de autenticación.
  sendDefaultPii: false,
  integrations: [
    // Casi todas las rutas del CRM atrapan el error y lo registran con
    // `log.error(...)` (src/lib/logger.ts) en vez de dejarlo subir, así que
    // onRequestError nunca se entera. Esto convierte cada log de nivel error o
    // fatal en un evento de Sentry.
    //
    // `log.levels: []` evita además enviar TODOS los logs (info, warn…) al
    // producto de logs de Sentry: son miles por día y llevan datos de contactos.
    Sentry.pinoIntegration({
      error: { levels: ["error", "fatal"] },
      log: { levels: [] },
    }),
  ],
});
