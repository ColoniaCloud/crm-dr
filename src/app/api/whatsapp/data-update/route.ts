import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { isWhatsappConfigured, sendWhatsapp } from "@/lib/whatsapp";
import {
  TIPO_DESTINO, MENSAJE_POR_DEFECTO, clientesSinEmail, emitirLinkDatos, armarMensaje, numeroDestino,
} from "@/lib/data-update";

const log = createLogger("api/whatsapp/data-update");

/**
 * Pedirles el email por WhatsApp a los Clientes que no lo tienen. El flujo
 * completo está en `src/lib/data-update.ts`.
 *
 * `GET` lista los Clientes sin email con el estado de su pedido.
 * `POST` manda el link personal a los que se eligieron.
 */
export async function GET() {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  try {
    return NextResponse.json({
      contactos: await clientesSinEmail(),
      mensajePorDefecto: MENSAJE_POR_DEFECTO,
      whatsappConfigurado: isWhatsappConfigured(),
    });
  } catch (error) {
    log.error({ err: error }, "Error listing clients without email");
    return NextResponse.json({ error: "Error al cargar los clientes" }, { status: 500 });
  }
}

// Pausa entre mensajes, al azar entre estos dos valores. Es un WhatsApp
// vinculado por QR (no la API oficial): una ráfaga de mensajes iguales con
// link es lo que WhatsApp marca como spam.
const PAUSA_MIN_MS = 4000;
const PAUSA_MAX_MS = 9000;
// Tope por envío: con la pausa de arriba son unos 6 minutos de request.
const MAX_POR_ENVIO = 40;

const schema = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(MAX_POR_ENVIO),
  message: z
    .string()
    .trim()
    .min(1, "El mensaje está vacío")
    .max(1000)
    .refine((m) => m.includes("{{link}}"), "El mensaje tiene que incluir {{link}}"),
});

export async function POST(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const validation = validateBody(schema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;
  const { contactIds, message } = validation.data;

  if (!isWhatsappConfigured()) {
    return NextResponse.json({ error: "El servicio de WhatsApp no está configurado" }, { status: 503 });
  }

  // Se vuelve a filtrar acá, no se confía en la lista que mandó la pantalla:
  // si entre que se cargó y se apretó "Enviar" alguien le cargó el email a un
  // Cliente, ya no hay nada que pedirle.
  const contactos = await prisma.contact.findMany({
    where: { id: { in: contactIds }, type: TIPO_DESTINO, OR: [{ email: null }, { email: "" }] },
    select: { id: true, firstName: true, lastName: true, whatsapp: true, phone: true },
  });

  const resultados: { id: string; nombre: string; ok: boolean; error?: string }[] = [];

  for (const [i, c] of contactos.entries()) {
    const nombre = `${c.firstName} ${c.lastName}`.trim();
    const numero = numeroDestino(c);
    if (!numero) {
      resultados.push({ id: c.id, nombre, ok: false, error: "Sin un número válido" });
      continue;
    }

    try {
      const { link } = await emitirLinkDatos(c.id, numero);
      const ok = await sendWhatsapp({
        to: numero,
        message: armarMensaje(message, c.firstName.trim(), link),
        // El historial no guarda el link: es una llave y lo lee cualquier SUPERADMIN.
        messageForLog: armarMensaje(message, c.firstName.trim(), "[link personal para cargar datos]"),
        contactId: c.id,
        sentById: session.user.id,
      });
      resultados.push({ id: c.id, nombre, ok, ...(ok ? {} : { error: "WhatsApp no lo entregó" }) });
    } catch (err) {
      log.error({ err, contactId: c.id }, "Error sending data-update link");
      resultados.push({ id: c.id, nombre, ok: false, error: "Error al generar el link" });
    }

    if (i < contactos.length - 1) {
      await new Promise((r) => setTimeout(r, PAUSA_MIN_MS + Math.random() * (PAUSA_MAX_MS - PAUSA_MIN_MS)));
    }
  }

  const enviados = resultados.filter((r) => r.ok).length;
  const salteados = contactIds.length - contactos.length;
  await logOperatorAction({
    userId: session.user.id,
    action: "WHATSAPP_DATA_UPDATE",
    entityType: "CONTACT",
    description:
      `Pidió el email por WhatsApp a ${contactos.length} cliente(s): ${enviados} enviados, ` +
      `${contactos.length - enviados} fallidos` +
      (salteados > 0 ? `, ${salteados} salteados (ya tenían email)` : ""),
    link: "/whatsapp",
  });

  return NextResponse.json({ enviados, fallidos: contactos.length - enviados, salteados, resultados });
}
