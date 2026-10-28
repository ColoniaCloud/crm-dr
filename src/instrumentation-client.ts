import * as Sentry from "@sentry/nextjs";

// Errores de JavaScript en el navegador de quien usa el CRM: los que el servidor
// nunca ve. Sin DSN no se inicializa nada.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // Sin grabación de sesión (Replay) a propósito: el CRM muestra datos de
    // clientes, precios y costos.
    //
    // Ruido que no es un bug nuestro: extensiones del navegador y redes que
    // cortan la conexión a mitad de carga.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      /^Non-Error promise rejection captured/,
      /Failed to fetch|Load failed|NetworkError when attempting to fetch/,
    ],
    denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i, /^safari-extension:\/\//i],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
