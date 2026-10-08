import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { clientIp } from "@/lib/request-ip";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
import { FirmaRechazada, signRemitoInPerson } from "@/lib/remito-sign";

const log = createLogger("api/remitos/sign-here");

const bodySchema = z.object({
  signature: z.string().min(1),
  name: z.string().min(1).max(200),
  dni: z.string().max(40).optional().nullable(),
  email: z.string().email().max(191).optional().nullable(),
  saveEmail: z.boolean().optional(),
});

/**
 * "Firmar acá": el cliente firma en la pantalla del CRM, delante de quien
 * vende (el mostrador). Queda como firma en el punto de venta, a nombre del
 * operador que tenía la sesión abierta.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const json = await request.json().catch(() => null);
  const parsed = validateBody(bodySchema, json);
  if (!parsed.success) return parsed.response;

  const { id } = await params;
  try {
    const { result, sentTo, emailSaved } = await signRemitoInPerson({
      remitoId: id,
      actorUserId: session.user.id,
      name: parsed.data.name,
      dni: parsed.data.dni,
      image: parsed.data.signature,
      email: parsed.data.email,
      saveEmail: parsed.data.saveEmail,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "SIGN_REMITO",
      entityType: "REMITO",
      entityId: id,
      description:
        `El cliente firmó en el local el remito #${result.remitoNumber} (venta #${result.saleNumber})` +
        (result.confirmada ? ", confirmada al firmar" : "") +
        (sentTo ? `; copia a ${sentTo}` : ""),
      link: `/sales/${result.saleId}`,
    });
    return NextResponse.json({ ok: true, sentTo, emailSaved, sinRollo: result.sinRollo });
  } catch (error) {
    if (error instanceof FirmaRechazada) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    log.error({ err: error, remitoId: id }, "Error en la firma presencial");
    return NextResponse.json({ error: "No se pudo registrar la firma" }, { status: 500 });
  }
}
