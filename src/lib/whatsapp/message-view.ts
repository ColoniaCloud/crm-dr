/**
 * Qué mostrar de un mensaje guardado en `whatsapp_cloud_messages`.
 *
 * `content` tiene formas distintas según de dónde vino la fila:
 *   - entrante: el mensaje tal cual lo manda Meta (`{ type: "text", text: { body } }`);
 *   - eco del celular: igual, pero saliente;
 *   - enviado desde el CRM: `{ type: "text", text: { body } }` o
 *     `{ type: "template", template: { name, language, components } }`;
 *   - fila mínima de un estado que llegó antes que su mensaje: `{}` con type "unknown".
 *
 * Meta puede agregar tipos sin avisar, así que todo lo desconocido cae en
 * `other` con un texto genérico en vez de romper la pantalla.
 *
 * Código puro: lo usan las rutas (para la vista previa de la lista) y la
 * pantalla (para dibujar el mensaje).
 */

export type MediaKind = "image" | "video" | "audio" | "document" | "sticker";

export type MessageView =
  | { kind: "text"; text: string }
  | { kind: "media"; media: MediaKind; id: string; mime?: string; caption?: string; filename?: string; voice?: boolean }
  | { kind: "location"; latitude: number; longitude: number; name?: string; address?: string }
  | { kind: "template"; name: string; language?: string; params: string[] }
  | { kind: "reaction"; emoji: string }
  | { kind: "reply"; text: string }
  | { kind: "other"; label: string };

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export function viewMessage(type: string, content: unknown): MessageView {
  const c: Json = isObj(content) ? content : {};

  switch (type) {
    case "text": {
      const text = isObj(c.text) ? str(c.text.body) : undefined;
      return { kind: "text", text: text ?? "" };
    }
    case "image":
    case "video":
    case "audio":
    case "document":
    case "sticker": {
      const m = isObj(c[type]) ? (c[type] as Json) : {};
      const id = str(m.id);
      if (!id) return { kind: "other", label: mediaLabel(type) };
      return {
        kind: "media",
        media: type,
        id,
        mime: str(m.mime_type),
        caption: str(m.caption),
        filename: str(m.filename),
        voice: m.voice === true,
      };
    }
    case "location": {
      const l = isObj(c.location) ? c.location : null;
      if (!l || typeof l.latitude !== "number" || typeof l.longitude !== "number") {
        return { kind: "other", label: "Ubicación" };
      }
      return { kind: "location", latitude: l.latitude, longitude: l.longitude, name: str(l.name), address: str(l.address) };
    }
    case "template": {
      const t = isObj(c.template) ? c.template : null;
      if (!t) return { kind: "other", label: "Plantilla" };
      const language = isObj(t.language) ? str(t.language.code) : undefined;
      return { kind: "template", name: str(t.name) ?? "plantilla", language, params: templateParams(t) };
    }
    case "reaction": {
      const r = isObj(c.reaction) ? c.reaction : null;
      return { kind: "reaction", emoji: (r && str(r.emoji)) || "" };
    }
    case "button": {
      const b = isObj(c.button) ? c.button : null;
      return { kind: "reply", text: (b && str(b.text)) || "Botón" };
    }
    case "interactive": {
      const i = isObj(c.interactive) ? c.interactive : null;
      const reply = i && (isObj(i.button_reply) ? i.button_reply : isObj(i.list_reply) ? i.list_reply : null);
      return { kind: "reply", text: (reply && str(reply.title)) || "Respuesta" };
    }
    case "unknown":
      // Fila mínima creada por un estado de entrega sin su mensaje (ver
      // `stub.ts`): salió por una vía que el CRM no vio.
      return c.stub === true
        ? { kind: "other", label: "Enviado fuera del CRM" }
        : { kind: "other", label: "Mensaje sin contenido guardado" };
    case "unsupported":
      return { kind: "other", label: "Mensaje que WhatsApp no pudo entregar" };
    default:
      if (type === "media_placeholder") return { kind: "other", label: "Archivo (del historial del celular)" };
      return { kind: "other", label: `Mensaje (${type})` };
  }
}

/** Los valores de las variables del cuerpo de una plantilla enviada. */
function templateParams(template: Json): string[] {
  const components = Array.isArray(template.components) ? template.components : [];
  const body = components.find((x) => isObj(x) && x.type === "body");
  if (!isObj(body) || !Array.isArray(body.parameters)) return [];
  return body.parameters.map((p) => (isObj(p) && typeof p.text === "string" ? p.text : ""));
}

function mediaLabel(type: string): string {
  switch (type) {
    case "image": return "Foto";
    case "video": return "Video";
    case "audio": return "Audio";
    case "document": return "Documento";
    case "sticker": return "Sticker";
    default: return "Archivo";
  }
}

/** Texto corto para la lista de conversaciones. */
export function previewOf(type: string, content: unknown): string {
  const v = viewMessage(type, content);
  switch (v.kind) {
    case "text": return v.text;
    case "media": return v.caption ? `${mediaLabel(v.media)}: ${v.caption}` : v.voice ? "Nota de voz" : mediaLabel(v.media);
    case "location": return "Ubicación";
    case "template": return `Plantilla: ${v.name}`;
    case "reaction": return v.emoji ? `Reaccionó con ${v.emoji}` : "Quitó su reacción";
    case "reply": return v.text;
    case "other": return v.label;
  }
}

/** Arma el texto de una plantilla reemplazando {{1}}, {{2}}... por sus valores. */
export function fillTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, n: string) => {
    const value = params[Number(n) - 1];
    return value !== undefined && value !== "" ? value : whole;
  });
}
