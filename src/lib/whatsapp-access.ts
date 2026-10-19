// Quién puede vincular y desvincular el número de WhatsApp del CRM (pestaña
// Conexión: estado, QR y cerrar sesión). El servicio tiene una sola sesión, así
// que esto decide qué número usa TODO el CRM para mandar: envíos manuales,
// campañas, avisos de turnos, remitos y "Pedir datos".
//
// SUPERADMIN siempre. Además, por regla de negocio, estas personas aunque no lo
// sean: Natalia es ADMIN y es la que maneja el número. El resto del módulo
// (campañas, historial, plantillas, "Pedir datos") sigue siendo solo SUPERADMIN.
//
// Sin imports de servidor a propósito: lo usan las rutas de la API y la página.
const WHATSAPP_CONNECTION_EMAILS = ["natalia@kristallfilm.com"];

export function canManageWhatsAppConnection(
  user: { role?: string | null; email?: string | null } | null | undefined
): boolean {
  if (!user) return false;
  if (user.role === "SUPERADMIN") return true;
  return WHATSAPP_CONNECTION_EMAILS.includes(user.email?.toLowerCase() ?? "");
}
