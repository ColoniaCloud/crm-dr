/**
 * Tipos del webhook de la WhatsApp Business Cloud API.
 *
 * Referencia: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 *
 * Son tipos de *entrada*: describen lo que Meta nos manda, y Meta puede agregar
 * campos sin avisar. Por eso casi todo lo que no es estructural es opcional, y
 * `WhatsAppMessageContent` tiene una rama abierta para los tipos que todavía no
 * modelamos. Quien consuma esto tiene que tolerar un `type` desconocido.
 */

// ─── Sobre del webhook ───────────────────────────────────────────────────────

export type WhatsAppWebhookPayload = {
  /** Siempre "whatsapp_business_account". */
  object: string;
  entry: WhatsAppWebhookEntry[];
};

export type WhatsAppWebhookEntry = {
  /** WABA ID. */
  id: string;
  changes: WhatsAppWebhookChange[];
};

/**
 * `field` dice qué trae `value`. Los que procesamos son `messages` y
 * `smb_message_echoes`; el resto (plantillas, calidad del número, historial de
 * coexistencia, etc.) se loguea y se ignora.
 */
export type WhatsAppWebhookChange =
  | { field: "messages"; value: WhatsAppMessagesValue }
  | { field: "smb_message_echoes"; value: WhatsAppEchoesValue }
  | { field: "history"; value: WhatsAppHistoryValue }
  | { field: string; value: unknown };

export type WhatsAppMetadata = {
  /** Número en formato visible, ej. "5491160484312". */
  display_phone_number: string;
  phone_number_id: string;
};

// ─── field: "messages" ───────────────────────────────────────────────────────

export type WhatsAppMessagesValue = {
  messaging_product: "whatsapp";
  metadata: WhatsAppMetadata;
  contacts?: WhatsAppWebhookContact[];
  messages?: WhatsAppInboundMessage[];
  statuses?: WhatsAppStatus[];
  /** Errores a nivel de cuenta/número (no de un mensaje puntual). */
  errors?: WhatsAppError[];
};

export type WhatsAppWebhookContact = {
  /** wa_id: número en E.164 sin "+". */
  wa_id: string;
  profile?: { name?: string };
  user_id?: string;
};

// ─── Mensajes entrantes ──────────────────────────────────────────────────────

export type WhatsAppMediaRef = {
  /** Se baja con `downloadMedia(id)`. La URL de Graph vence a los 5 minutos. */
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  /** Solo en documentos. */
  filename?: string;
  /** Solo en audios: true si es nota de voz. */
  voice?: boolean;
};

export type WhatsAppContext = {
  /** wamid del mensaje al que responde. */
  id?: string;
  from?: string;
  forwarded?: boolean;
  frequently_forwarded?: boolean;
};

/** Campos que comparten todos los mensajes entrantes. */
type WhatsAppInboundBase = {
  /** wamid. */
  id: string;
  /** wa_id del remitente. */
  from: string;
  /** Epoch en segundos, como string. */
  timestamp: string;
  context?: WhatsAppContext;
  /** Presente cuando WhatsApp no pudo entregar el contenido (type "unsupported"). */
  errors?: WhatsAppError[];
};

export type WhatsAppTextMessage = WhatsAppInboundBase & {
  type: "text";
  text: { body: string };
};

export type WhatsAppImageMessage = WhatsAppInboundBase & {
  type: "image";
  image: WhatsAppMediaRef;
};

export type WhatsAppVideoMessage = WhatsAppInboundBase & {
  type: "video";
  video: WhatsAppMediaRef;
};

export type WhatsAppAudioMessage = WhatsAppInboundBase & {
  type: "audio";
  audio: WhatsAppMediaRef;
};

export type WhatsAppDocumentMessage = WhatsAppInboundBase & {
  type: "document";
  document: WhatsAppMediaRef;
};

export type WhatsAppStickerMessage = WhatsAppInboundBase & {
  type: "sticker";
  sticker: WhatsAppMediaRef & { animated?: boolean };
};

export type WhatsAppLocationMessage = WhatsAppInboundBase & {
  type: "location";
  location: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
};

export type WhatsAppReactionMessage = WhatsAppInboundBase & {
  type: "reaction";
  /** `emoji` viene vacío cuando se quita la reacción. */
  reaction: { message_id: string; emoji?: string };
};

/** Respuesta a un botón de una plantilla (quick reply). */
export type WhatsAppButtonMessage = WhatsAppInboundBase & {
  type: "button";
  button: { payload: string; text: string };
};

/** Respuesta a un mensaje interactivo (botones de respuesta o lista). */
export type WhatsAppInteractiveReplyMessage = WhatsAppInboundBase & {
  type: "interactive";
  interactive:
    | {
        type: "button_reply";
        button_reply: { id: string; title: string };
      }
    | {
        type: "list_reply";
        list_reply: { id: string; title: string; description?: string };
      };
};

/** Tipos que Meta manda pero todavía no modelamos (contacts, order, system, ...). */
export type WhatsAppOtherMessage = WhatsAppInboundBase & {
  type: string;
  [key: string]: unknown;
};

export type WhatsAppInboundMessage =
  | WhatsAppTextMessage
  | WhatsAppImageMessage
  | WhatsAppVideoMessage
  | WhatsAppAudioMessage
  | WhatsAppDocumentMessage
  | WhatsAppStickerMessage
  | WhatsAppLocationMessage
  | WhatsAppReactionMessage
  | WhatsAppButtonMessage
  | WhatsAppInteractiveReplyMessage
  | WhatsAppOtherMessage;

// ─── Estados de entrega ──────────────────────────────────────────────────────

export type WhatsAppStatusValue = "sent" | "delivered" | "read" | "failed";

export type WhatsAppStatus = {
  /** wamid del mensaje saliente. */
  id: string;
  status: WhatsAppStatusValue;
  /** Epoch en segundos, como string. */
  timestamp: string;
  /** wa_id del destinatario. */
  recipient_id: string;
  conversation?: {
    id: string;
    origin?: { type: string };
    expiration_timestamp?: string;
  };
  pricing?: {
    billable?: boolean;
    pricing_model?: string;
    category?: string;
  };
  /** Solo cuando `status === "failed"`. */
  errors?: WhatsAppError[];
};

// ─── Errores ─────────────────────────────────────────────────────────────────

export type WhatsAppError = {
  code: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
  href?: string;
};

// ─── field: "smb_message_echoes" (coexistencia) ──────────────────────────────

/**
 * Lo que se escribe desde la app de WhatsApp Business del celular mientras el
 * número está en coexistencia. Es un mensaje *saliente* que Meta nos copia.
 */
export type WhatsAppEchoesValue = {
  messaging_product: "whatsapp";
  metadata: WhatsAppMetadata;
  message_echoes?: WhatsAppEchoMessage[];
};

export type WhatsAppEchoMessage = {
  id: string;
  /** El número del negocio. */
  from: string;
  /** El cliente. */
  to: string;
  timestamp: string;
  type: string;
  [key: string]: unknown;
};

// ─── field: "history" (coexistencia) ─────────────────────────────────────────

/**
 * El historial de chats de la app de WhatsApp Business, que Meta manda por
 * partes una sola vez después de conectar un número en coexistencia (si quien
 * lo conectó aceptó compartirlo). Cada parte trae hilos (uno por contacto) con
 * sus mensajes, en los dos sentidos.
 */
export type WhatsAppHistoryValue = {
  messaging_product: "whatsapp";
  metadata: WhatsAppMetadata;
  history?: WhatsAppHistoryChunk[];
};

export type WhatsAppHistoryChunk = {
  /** phase 0..2, chunk_order para ordenar, progress 0..100. */
  metadata?: { phase?: number; chunk_order?: number; progress?: number };
  threads?: WhatsAppHistoryThread[];
  /** Si no se compartió el historial: code 2593109. */
  errors?: WhatsAppError[];
};

export type WhatsAppHistoryThread = {
  /** El número del contacto (ausente si Meta no lo tiene). */
  id?: string;
  context?: { wa_id?: string; user_id?: string; username?: string };
  messages?: WhatsAppHistoryMessage[];
};

export type WhatsAppHistoryMessage = {
  id: string;
  /** El número de quien lo mandó: el negocio o el contacto. */
  from?: string;
  timestamp: string;
  /** Las fotos, audios y documentos llegan como "media_placeholder". */
  type: string;
  history_context?: { status?: string };
  [key: string]: unknown;
};

// ─── Envío (Graph API) ───────────────────────────────────────────────────────

/** Componente de una plantilla, tal como lo pide `POST /messages` (type "template"). */
export type WhatsAppTemplateComponent = {
  type: "header" | "body" | "button";
  sub_type?: "quick_reply" | "url" | "phone_number";
  index?: string;
  parameters?: WhatsAppTemplateParameter[];
};

export type WhatsAppTemplateParameter =
  | { type: "text"; text: string }
  | { type: "currency"; currency: { fallback_value: string; code: string; amount_1000: number } }
  | { type: "date_time"; date_time: { fallback_value: string } }
  | { type: "image"; image: { link: string } | { id: string } }
  | { type: "document"; document: { link: string; filename?: string } | { id: string } }
  | { type: "video"; video: { link: string } | { id: string } }
  | { type: "payload"; payload: string };

/** Respuesta de `POST /{phone-number-id}/messages`. */
export type WhatsAppSendResponse = {
  messaging_product: "whatsapp";
  contacts: { input: string; wa_id: string }[];
  messages: { id: string; message_status?: string }[];
};

/** Respuesta de `GET /{media-id}`. */
export type WhatsAppMediaInfo = {
  id: string;
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  messaging_product: "whatsapp";
};
