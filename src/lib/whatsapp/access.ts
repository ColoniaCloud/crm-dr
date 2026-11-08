import type { AppRole } from "@/lib/api-auth";

/**
 * Quién puede usar WhatsApp desde el CRM: leer y contestar la bandeja, mandar
 * plantillas, ver y crear plantillas.
 *
 * Solo ADMIN y SUPERADMIN: la bandeja trae las conversaciones con clientes y
 * desde acá se manda a nombre de la empresa (plantillas, envíos masivos). Un
 * OPERATOR sigue pudiendo abrir WhatsApp Web desde el número de una lista, pero
 * eso sale por su propia sesión de WhatsApp, no por el CRM.
 *
 * Se cambia solo acá: las rutas, el botón del encabezado, la pantalla y los
 * botones de las listas lo siguen.
 *
 * "Pedir datos" (el envío del pedido de email a Clientes) es solo SUPERADMIN:
 * no pasa por acá.
 */
export const WHATSAPP_ROLES: AppRole[] = ["ADMIN", "SUPERADMIN"];

export const canUseWhatsApp = (role: string | null | undefined): boolean =>
  WHATSAPP_ROLES.includes(role as AppRole);
