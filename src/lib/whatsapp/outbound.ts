import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { STUB_TYPE } from "@/lib/whatsapp/stub";
import type { WhatsAppSendResponse } from "@/types/whatsapp";

const log = createLogger("lib/whatsapp/outbound");

/**
 * Deja la fila de un saliente que mandó el CRM, para que los estados que llegan
 * por webhook (sent, delivered, read, failed) tengan a quién actualizar y para
 * que el mensaje se vea en la bandeja y en la ficha del contacto.
 *
 * Puede pasar que el estado llegue antes que esta fila (el webhook y la
 * respuesta de la API corren en paralelo): en ese caso el procesador del webhook
 * ya dejó una fila mínima (ver `stub.ts`) y acá se completa en vez de chocar,
 * sin tocar el estado, que ya es el más avanzado que se vio.
 *
 * No tira: el mensaje ya salió, y que no quede registrado no es motivo para
 * hacer fallar a quien lo mandó.
 */
export async function recordOutbound(args: {
  wamid: string;
  to: string;
  /** "text" | "template" */
  type: string;
  /** El objeto tal como se mandó a la Graph API (sin el `to`). */
  content: Prisma.InputJsonValue;
  templateName?: string | null;
  response: WhatsAppSendResponse;
  contactId?: string | null;
  sentById?: string | null;
}): Promise<void> {
  const rawPayload = args.response as unknown as Prisma.InputJsonValue;
  const from = await businessNumber();

  try {
    await prisma.whatsAppCloudMessage.create({
      data: {
        wamid: args.wamid,
        direction: "outbound",
        from,
        to: args.to,
        type: args.type,
        content: args.content,
        timestamp: new Date(),
        status: "sent",
        statusUpdatedAt: new Date(),
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
        wabaId: process.env.WHATSAPP_WABA_ID ?? "",
        contactId: args.contactId ?? null,
        sentById: args.sentById ?? null,
        templateName: args.templateName ?? null,
        rawPayload,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Ya estaba la fila mínima del webhook: se le pone el contenido.
      await prisma.whatsAppCloudMessage
        .updateMany({
          where: { wamid: args.wamid, type: STUB_TYPE },
          data: {
            type: args.type,
            content: args.content,
            contactId: args.contactId ?? null,
            sentById: args.sentById ?? null,
            templateName: args.templateName ?? null,
            rawPayload,
          },
        })
        .catch((e) => log.error({ err: e }, "No se pudo completar el registro del WhatsApp"));
      return;
    }
    log.error({ err }, "No se pudo registrar el WhatsApp enviado");
  }
}

/**
 * Meta rechaza las variables con saltos de línea, tabulaciones o más de 4
 * espacios seguidos, y las vacías. Se limpian acá para que un dato sucio (una
 * dirección con un enter) no tumbe el aviso entero.
 */
export function cleanParam(value: string): string {
  const clean = (value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {5,}/g, "    ")
    .trim()
    .slice(0, 1000);
  return clean || "-";
}

/**
 * El número del negocio, el que ven los clientes (ej. 5491160484312).
 *
 * `WHATSAPP_BUSINESS_NUMBER` si está; si no, el que Meta puso como destino en el
 * último mensaje entrante (`to`), que es siempre ese número. Solo si todavía no
 * entró ningún mensaje se cae al id del número de la API, que no es un teléfono
 * pero al menos identifica de qué número salió.
 */
async function businessNumber(): Promise<string> {
  const fromEnv = (process.env.WHATSAPP_BUSINESS_NUMBER ?? "").replace(/\D/g, "");
  if (fromEnv) return fromEnv;

  try {
    const lastInbound = await prisma.whatsAppCloudMessage.findFirst({
      where: { direction: "inbound" },
      orderBy: { timestamp: "desc" },
      select: { to: true },
    });
    if (lastInbound?.to) return lastInbound.to;
  } catch (err) {
    log.warn({ err }, "No se pudo averiguar el número del negocio");
  }
  return (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").replace(/\D/g, "");
}
