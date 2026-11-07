import type { AppRole } from "@/lib/api-auth";

/**
 * Quién puede usar WhatsApp desde el CRM: leer y contestar la bandeja, mandar
 * plantillas, ver y crear plantillas.
 *
 * Son los tres roles porque la campaña de WhatsApp la hace el equipo de
 * operación (el módulo de Perú, por ejemplo, ya lo usan todos). Si hay que
 * achicarlo, se cambia solo acá —por ejemplo a `["ADMIN", "SUPERADMIN"]`— y las
 * rutas y el botón del encabezado lo siguen.
 *
 * "Pedir datos" (el envío masivo del email a Clientes) sigue siendo solo
 * SUPERADMIN: no pasa por acá.
 */
export const WHATSAPP_ROLES: AppRole[] = ["OPERATOR", "ADMIN", "SUPERADMIN"];

export const canUseWhatsApp = (role: string | null | undefined): boolean =>
  WHATSAPP_ROLES.includes(role as AppRole);
