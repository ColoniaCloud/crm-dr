import { esDemo } from "@/lib/demo-context";

/**
 * Las líneas de WhatsApp del CRM: cada una es un número de la Cloud API con su
 * propia bandeja.
 *
 *   WPP Carlos — la línea de siempre. Sus ids salen de las variables de entorno
 *                (`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`) y por ella salen
 *                los avisos automáticos (garantías, turnos, invitaciones).
 *   WPP Nati   — un número en coexistencia (la app de WhatsApp Business del
 *                celular + la API), en su propia cuenta de Meta: tiene sus propias
 *                plantillas y su propia facturación.
 *
 * Todo cuelga de la misma app de Meta, así que el webhook y el token son los
 * mismos; lo que distingue un mensaje de otro es el `phoneNumberId` con que se
 * guardó.
 *
 * Quién ve qué (se decide solo acá, ver `linesFor`):
 *   - quien tiene una línea asignada ve **solo** esa, sea cual sea su rol;
 *   - SUPERADMIN ve todas, cada una por separado;
 *   - el resto (ADMIN) ve la línea principal, como siempre.
 *
 * Los ids de una línea no son secretos (el token sí, y sigue en el entorno).
 */

export type WhatsAppLine = {
  /** Va en la URL (`?line=`) y en el selector. */
  key: string;
  label: string;
  /** Id del número en la Cloud API: con qué se manda y qué mensajes son de esta línea. */
  phoneNumberId: string;
  /** Cuenta de WhatsApp (WABA) dueña de las plantillas de esta línea. */
  wabaId: string;
  /** El número visible, sin "+", si se conoce. */
  businessNumber?: string;
  primary: boolean;
  /** Emails de quienes solo pueden usar esta línea. */
  users: string[];
};

/** Lo que se le manda a la pantalla: nada de ids de Meta. */
export type WhatsAppLineInfo = {
  key: string;
  label: string;
  primary: boolean;
  /** Conversaciones cuyo último mensaje es del cliente. */
  awaiting: number;
};

const SECONDARY_LINES: Omit<WhatsAppLine, "primary">[] = [
  {
    key: "nati",
    label: "WPP Nati",
    phoneNumberId: "925630763976057",
    wabaId: "1378679683744985",
    businessNumber: "5491168477185",
    users: ["natalia@kristallfilm.com"],
  },
];

const digits = (value: string | undefined) => (value ?? "").replace(/\D/g, "");

export function primaryLine(): WhatsAppLine {
  return {
    key: "carlos",
    label: "WPP Carlos",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    wabaId: process.env.WHATSAPP_WABA_ID ?? "",
    businessNumber: digits(process.env.WHATSAPP_BUSINESS_NUMBER) || undefined,
    primary: true,
    users: [],
  };
}

/** Las líneas que no son la principal (si el entorno apunta a una de ellas, esa pasa a ser la principal). */
function secondaryLines(): WhatsAppLine[] {
  const primaryId = primaryLine().phoneNumberId;
  return SECONDARY_LINES.filter((l) => l.phoneNumberId !== primaryId).map((l) => ({ ...l, primary: false }));
}

/**
 * Qué líneas puede usar alguien, la primera es la que se le abre por defecto.
 *
 * La asignación manda sobre el rol, y nunca cae a la línea principal: si alguien
 * está asignado a una línea, esa es la única que ve aunque algo esté mal
 * configurado.
 */
export function linesFor(user: { role?: string | null; email?: string | null }): WhatsAppLine[] {
  const email = (user.email ?? "").trim().toLowerCase();
  const assigned = email ? secondaryLines().filter((l) => l.users.includes(email)) : [];
  if (assigned.length) return assigned;

  // En la demostración, o sin la Cloud API configurada, hay una sola bandeja.
  const several = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID) && !esDemo();
  if (user.role === "SUPERADMIN" && several) return [primaryLine(), ...secondaryLines()];
  return [primaryLine()];
}

/** Está asignado a una línea que no es la principal: no puede mandar nada por la principal. */
export function isLineRestricted(user: { role?: string | null; email?: string | null }): boolean {
  return linesFor(user).every((l) => !l.primary);
}

/** A qué línea pertenece un mensaje, por el id del número con que se guardó. */
export function lineOfPhoneNumberId(phoneNumberId: string | null | undefined): WhatsAppLine {
  return secondaryLines().find((l) => l.phoneNumberId === phoneNumberId) ?? primaryLine();
}

export function isPrimaryPhoneNumberId(phoneNumberId: string | null | undefined): boolean {
  return lineOfPhoneNumberId(phoneNumberId).primary;
}

/**
 * El filtro de Prisma con los mensajes de una línea.
 *
 * La principal es "todo lo que no es de otra línea" y no "lo que tiene su id":
 * así entran también las filas viejas o de prueba que se guardaron con otro id,
 * y nada queda huérfano sin bandeja.
 */
export function lineWhere(line: WhatsAppLine): { phoneNumberId: string | { notIn: string[] } } {
  if (!line.primary) return { phoneNumberId: line.phoneNumberId };
  return { phoneNumberId: { notIn: secondaryLines().map((l) => l.phoneNumberId) } };
}

/**
 * La cuenta cuyas plantillas usa una línea, como la piden `templates.ts` y el
 * cliente de Meta: `""` es la de las variables de entorno (la principal).
 */
export function templatesAccountOf(line: WhatsAppLine): string {
  return line.primary ? "" : line.wabaId;
}
