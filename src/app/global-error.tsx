"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Último recurso: se muestra cuando falla el layout raíz, que reemplaza a toda
 * la app. Sin esto el usuario vería la pantalla de error pelada de Next.
 *
 * Reemplaza al root layout, así que tiene que traer su propio <html> y <body>, y
 * no puede apoyarse en los estilos de la app: por eso van en línea.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  // Un error con `digest` nació en el servidor y ya lo reportó onRequestError
  // (instrumentation.ts); acá llega sin mensaje. Reportarlo de nuevo solo
  // duplica el evento.
  useEffect(() => {
    if (!error.digest) Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <div>
          <p style={{ fontSize: "1.125rem", fontWeight: 600 }}>Algo salió mal</p>
          <p style={{ color: "#666", maxWidth: "24rem" }}>
            El CRM tuvo un problema inesperado. Recargá la página; si sigue pasando, avisá al equipo.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: "0.5rem", textDecoration: "underline", cursor: "pointer", background: "none", border: 0 }}
          >
            Recargar
          </button>
        </div>
      </body>
    </html>
  );
}
