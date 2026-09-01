import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkshopAccess } from "@/lib/workshop-auth";
import { validateBody } from "@/lib/api-validation";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { datosParaMail, enviarMailDeGarantia } from "@/lib/workshop-warranty";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/workshop/orders/[orderId]/warranty-email");

type Params = { params: Promise<{ contactId: string; orderId: string }> };

const schema = z.object({
  /** Para mandarlo a otra dirección; por defecto va a la del cliente final. */
  email: z.string().email().max(191).optional(),
});

/**
 * Reenvía el mail de garantía de una orden ya terminada.
 *
 * Existe porque sin esto la regla del plan —"si el mail falla, se reintenta"—
 * no tenía cómo cumplirse. El `activationToken` **no sale del CRM** (es la
 * capacidad completa sobre la garantía, ver F0-2), así que el flujo de reenvío
 * que ya existía en kristall-web no sirve acá: aquel necesita el token en la
 * mano, y solo lo tiene quien acaba de generar el sub-código.
 *
 * Acá el token no viaja a ningún lado: el CRM lo lee de su propia base y manda
 * el mail. El instalador solo dice "reenviá".
 *
 * También sirve para el caso más común de todos: el cliente no había dejado
 * email cuando se terminó el trabajo, lo deja después, y el taller se lo manda.
 */
export async function POST(request: Request, { params }: Params) {
  const { contactId, orderId } = await params;
  const gate = await requireWorkshopAccess(request, contactId);
  if (!gate.success) return gate.response;

  const json = await request.json().catch(() => ({}));
  const validation = validateBody(schema, json ?? {});
  if (!validation.success) return validation.response;

  // Límite propio por orden: reenviar es legítimo, mandar el mismo mail veinte
  // veces no. Va aparte del límite general por key.
  const rl = rateLimit(`workshop-warranty-mail:${orderId}`, 5, 60 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Ya reenviaste este mail varias veces. Esperá ${Math.ceil(rl.retryAfter / 60)} minutos.` },
      { status: 429 }
    );
  }

  try {
    const order = await prisma.workOrder.findFirst({
      where: { id: orderId, contactId: gate.contactId },
      select: { id: true, warrantyInstallationId: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }
    if (!order.warrantyInstallationId) {
      return NextResponse.json(
        { error: "Esta orden todavía no generó ninguna garantía" },
        { status: 409 }
      );
    }

    const datos = await datosParaMail(order.id, order.warrantyInstallationId);
    if (!datos) {
      return NextResponse.json({ error: "No pudimos armar el mail" }, { status: 500 });
    }

    const destinatario = validation.data.email ?? datos.destinatario;
    if (!destinatario) {
      return NextResponse.json(
        { error: "Este cliente no tiene email cargado. Cargalo o escribí uno acá." },
        { status: 400 }
      );
    }

    const resultado = await enviarMailDeGarantia({ ...datos, destinatario });
    if (!resultado.enviado) {
      return NextResponse.json({ error: resultado.motivo ?? "No pudimos enviar el mail" }, { status: 502 });
    }
    return NextResponse.json({ enviado: true, destinatario });
  } catch (error) {
    log.error({ err: error }, "Error resending workshop warranty email");
    return NextResponse.json({ error: "Error al reenviar el mail" }, { status: 500 });
  }
}
