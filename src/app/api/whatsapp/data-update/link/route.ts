import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { TIPO_DESTINO, emitirLinkDatos, armarMensaje, numeroDestino } from "@/lib/data-update";

const log = createLogger("api/whatsapp/data-update/link");

const schema = z.object({
  contactId: z.string().min(1),
  message: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .refine((m) => m.includes("{{link}}"), "El mensaje tiene que incluir {{link}}"),
});

/**
 * Genera el link personal sin mandarlo, para que el operador lo mande a mano
 * desde la app de WhatsApp Business.
 *
 * Existe porque el número de Kristall está administrado por la plataforma de
 * Meta, y lo que sale por el servicio vinculado por QR le llega al cliente como
 * "Esperando mensaje" (2026-10-09). Hasta pasar a la API oficial, este es el
 * camino que funciona.
 *
 * Cada llamada emite un link nuevo e invalida el anterior: los tokens se guardan
 * hasheados, así que uno ya emitido no se puede volver a mostrar.
 */
export async function POST(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const validation = validateBody(schema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;
  const { contactId, message } = validation.data;

  try {
    const c = await prisma.contact.findFirst({
      where: { id: contactId, type: TIPO_DESTINO, OR: [{ email: null }, { email: "" }] },
      select: { id: true, firstName: true, lastName: true, company: true, whatsapp: true, phone: true },
    });
    if (!c) {
      return NextResponse.json({ error: "Ese cliente ya tiene email o no existe" }, { status: 404 });
    }
    const numero = numeroDestino(c);
    if (!numero) {
      return NextResponse.json({ error: "El cliente no tiene un número válido" }, { status: 400 });
    }

    const { link, expiresAt } = await emitirLinkDatos(c.id, numero);

    await logOperatorAction({
      userId: session.user.id,
      action: "WHATSAPP_DATA_UPDATE_LINK",
      entityType: "CONTACT",
      entityId: c.id,
      description: `Generó un link para cargar datos de "${c.company || `${c.firstName} ${c.lastName}`.trim()}" (para enviar a mano)`,
      link: `/clients/${c.id}`,
    });

    return NextResponse.json({
      numero,
      texto: armarMensaje(message, c.firstName.trim(), link),
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    log.error({ err: error }, "Error generating data-update link");
    return NextResponse.json({ error: "Error al generar el link" }, { status: 500 });
  }
}
