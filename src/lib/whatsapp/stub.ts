/**
 * Una fila "mínima" de `whatsapp_cloud_messages`: se creó a partir de un estado
 * de entrega (`statuses[]`) sin que existiera el mensaje, porque salió por una
 * vía que el CRM no registró (el celular sin el eco suscripto, la consola de
 * Meta, otra herramienta) o porque el estado le ganó de mano al registro.
 *
 * Tiene este `type` y este contenido; la pantalla la rotula como "Enviado fuera
 * del CRM". Si el mensaje real aparece después, el procesador del webhook la
 * completa (ver `saveMessage`).
 *
 * Código puro (sin base): lo usan el procesador y la vista del mensaje.
 */
export const STUB_TYPE = "unknown";
export const STUB_CONTENT = { stub: true, motivo: "estado_sin_mensaje" } as const;
