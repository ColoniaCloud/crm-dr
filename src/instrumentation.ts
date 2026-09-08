export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.MAIL_POLLING_DISABLED !== "true") {
    const { startMailPoller } = await import("@/lib/mail-poller");
    startMailPoller();
  }

  if (process.env.OVERDUE_WATCHER_DISABLED !== "true") {
    const { startOverdueWatcher } = await import("@/lib/overdue-installments");
    startOverdueWatcher();
  }

  // La limpieza de demostraciones NO se arranca acá a propósito: hacerlo abre
  // la conexión a la base de demo antes del primer request. Se arma sola en el
  // primer uso real, desde el endpoint de sesión. Ver `demo-cleanup.ts`.
}
