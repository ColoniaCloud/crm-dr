import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { isCloudApiConfigured } from "@/lib/whatsapp/client";
import { sendDataRequestNotice } from "@/lib/whatsapp/notices";
import {
  TIPO_DESTINO, MENSAJE_POR_DEFECTO, clientesSinEmail, emitirLinkDatos, numeroDestino,
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
      whatsappConfigurado: isCloudApiConfigured(),
    });
  } catch (error) {
    log.error({ err: error }, "Error listing clients without email");
    return NextResponse.json({ error: "Error al cargar los clientes" }, { status: 500 });
  }
}

// Tope por envío. Ya no hay pausa entre mensajes (era para el WhatsApp vinculado
// por QR, que marcaba como spam una ráfaga de mensajes iguales con link): la
// Cloud API manda con plantilla aprobada y el request dura unos segundos.
const MAX_POR_ENVIO = 40;

const schema = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(MAX_POR_ENVIO),
});

export async function POST(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const validation = validateBody(schema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;
  const { contactIds } = validation.data;

  if (!isCloudApiConfigured()) {
    return NextResponse.json({ error: "WhatsApp (Cloud API) no está configurado" }, { status: 503 });
  }

  // Se vuelve a filtrar acá, no se confía en la lista que mandó la pantalla:
  // si entre que se cargó y se apretó "Enviar" alguien le cargó el email a un
  // Cliente, ya no hay nada que pedirle.
  const contactos = await prisma.contact.findMany({
    where: { id: { in: contactIds }, type: TIPO_DESTINO, OR: [{ email: null }, { email: "" }] },
    select: { id: true, firstName: true, lastName: true, whatsapp: true, phone: true },
  });

  const resultados: { id: string; nombre: string; ok: boolean; error?: string }[] = [];

  for (const c of contactos) {
    const nombre = `${c.firstName} ${c.lastName}`.trim();
    const numero = numeroDestino(c);
    if (!numero) {
      resultados.push({ id: c.id, nombre, ok: false, error: "Sin un número válido" });
      continue;
    }

    try {
      const { link } = await emitirLinkDatos(c.id, numero);
      const ok = await sendDataRequestNotice({
        to: numero,
        nombre: c.firstName.trim(),
        link,
        contactId: c.id,
        sentById: session.user.id,
      });
      resultados.push({ id: c.id, nombre, ok, ...(ok ? {} : { error: "WhatsApp no lo entregó" }) });
    } catch (err) {
      log.error({ err, contactId: c.id }, "Error sending data-update link");
      resultados.push({ id: c.id, nombre, ok: false, error: "Error al generar el link" });
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
