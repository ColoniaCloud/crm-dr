import type {
  WhatsAppStatusValue,
  WhatsAppWebhookPayload,
} from "@/types/whatsapp";

/**
 * Payloads del webhook de la Cloud API, con la forma que documenta Meta
 * (developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples) y
 * la que vimos llegar en producción. Los números e ids son inventados.
 *
 * Una rareza argentina que está a propósito: el móvil escribe `549…` (13
 * dígitos) cuando es `from` de un mensaje, pero Meta suele devolver `54…` (12)
 * en el `recipient_id` de los estados. Es la misma persona.
 */

export const BUSINESS_DISPLAY = "5491155550000";
export const PHONE_NUMBER_ID = "100000000000001";
export const WABA_ID = "200000000000001";

/** El cliente, tal como aparece en `messages[].from`. */
export const CUSTOMER_WA = "5491166660000";
/** El mismo cliente, tal como aparece en `statuses[].recipient_id`. */
export const CUSTOMER_RECIPIENT = "541166660000";

export const WAMID_OUT = "wamid.OUT_AAAA1111";
export const WAMID_IN = "wamid.IN_BBBB2222";

const metadata = { display_phone_number: BUSINESS_DISPLAY, phone_number_id: PHONE_NUMBER_ID };

const wrap = (field: string, value: unknown): WhatsAppWebhookPayload => ({
  object: "whatsapp_business_account",
  entry: [{ id: WABA_ID, changes: [{ field, value }] }],
});

/** Mensaje de texto de un cliente, con su nombre de perfil. */
export const inboundText = (over: { wamid?: string; from?: string; name?: string | null; body?: string } = {}) =>
  wrap("messages", {
    messaging_product: "whatsapp",
    metadata,
    contacts: [
      {
        wa_id: over.from ?? CUSTOMER_WA,
        ...(over.name === null ? {} : { profile: { name: over.name ?? "Marcos Pérez" } }),
      },
    ],
    messages: [
      {
        id: over.wamid ?? WAMID_IN,
        from: over.from ?? CUSTOMER_WA,
        timestamp: "1762560000",
        type: "text",
        text: { body: over.body ?? "Hola, ¿tienen lámina 35%?" },
      },
    ],
  });

/** Un estado de entrega del mensaje saliente `WAMID_OUT`. */
export const status = (
  state: WhatsAppStatusValue,
  at: number,
  over: { wamid?: string; errors?: boolean } = {}
) =>
  wrap("messages", {
    messaging_product: "whatsapp",
    metadata,
    statuses: [
      {
        id: over.wamid ?? WAMID_OUT,
        status: state,
        timestamp: String(at),
        recipient_id: CUSTOMER_RECIPIENT,
        ...(state === "sent"
          ? { conversation: { id: "conv_1", origin: { type: "service" } }, pricing: { billable: false } }
          : {}),
        ...(over.errors
          ? {
              errors: [
                {
                  code: 131047,
                  title: "Re-engagement message",
                  message: "Re-engagement message",
                  error_data: { details: "Message failed to send because more than 24 hours have passed" },
                },
              ],
            }
          : {}),
      },
    ],
  });

/** Eco de lo que alguien escribió desde la app del celular (coexistencia). */
export const echoText = (over: { wamid?: string; body?: string } = {}) =>
  wrap("smb_message_echoes", {
    messaging_product: "whatsapp",
    metadata,
    message_echoes: [
      {
        id: over.wamid ?? WAMID_OUT,
        from: BUSINESS_DISPLAY,
        to: CUSTOMER_WA,
        timestamp: "1762560100",
        type: "text",
        text: { body: over.body ?? "Hola Marcos, sí, tenemos." },
      },
    ],
  });
