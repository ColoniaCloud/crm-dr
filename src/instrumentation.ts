export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.MAIL_POLLING_DISABLED === "true") return;

  const { startMailPoller } = await import("@/lib/mail-poller");
  startMailPoller();
}
