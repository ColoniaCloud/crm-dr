import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { WHERE_COMPRADOR } from "@/lib/contact-types";
import { round2, toCents } from "@/lib/account-calc";
import { MANUAL_ADJUSTMENT_TYPES, signedAdjustmentAmount } from "@/lib/account-adjustments";

const log = createLogger("api/clients/[id]/adjustments");

const createAdjustmentSchema = z.object({
  type: z.enum(MANUAL_ADJUSTMENT_TYPES),
  /** Siempre positivo: el signo sale del tipo (ver signedAdjustmentAmount). */
  amount: z.number().positive().max(1_000_000_000),
  description: z.string().trim().min(5, "Explicá el motivo (mínimo 5 caracteres)").max(500),
  /** Fecha del movimiento en el extracto. Por defecto, ahora. */
  effectiveAt: z.string().optional(),
});

/**
 * Ajuste manual de cuenta corriente: nota de débito, nota de crédito,
 * condonación o saldo inicial.
 *
 * Solo SUPERADMIN: mueve el saldo del cliente sin una venta ni un pago detrás,
 * y el cliente lo ve en su panel. Hasta acá la única forma de crear un
 * `AccountAdjustment` era una devolución, así que corregir un centavo de
 * redondeo (Ultraglass, venta #101) exigía tocar la base a mano.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const { id } = await params;
  const json = await request.json().catch(() => null);
  const parsed = validateBody(createAdjustmentSchema, json);
  if (!parsed.success) return parsed.response;
  const { type, amount, description, effectiveAt } = parsed.data;

  if (toCents(amount) <= 0) {
    return NextResponse.json({ error: "El monto tiene que ser de al menos un centavo" }, { status: 400 });
  }

  let fecha = new Date();
  if (effectiveAt) {
    fecha = new Date(effectiveAt);
    if (Number.isNaN(fecha.getTime())) {
      return NextResponse.json({ error: "La fecha no es válida" }, { status: 400 });
    }
    if (fecha.getTime() > Date.now() + 60 * 60 * 1000) {
      return NextResponse.json({ error: "La fecha no puede ser futura" }, { status: 400 });
    }
  }

  try {
    const contact = await prisma.contact.findFirst({
      where: { id, ...WHERE_COMPRADOR },
      select: { id: true, firstName: true, lastName: true, company: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const signed = signedAdjustmentAmount(type, round2(amount));
    const adjustment = await prisma.accountAdjustment.create({
      data: {
        contactId: id,
        type,
        amount: new Prisma.Decimal(signed),
        description,
        effectiveAt: fecha,
        createdById: session.user.id,
      },
      select: { id: true, type: true, amount: true, description: true, effectiveAt: true },
    });

    const nombre = contact.company || `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim();
    await logOperatorAction({
      userId: session.user.id,
      action: "CREATE_ACCOUNT_ADJUSTMENT",
      entityType: "ACCOUNT_ADJUSTMENT",
      entityId: adjustment.id,
      description: `Cargó un ajuste (${type}) de $${signed} a la cuenta de "${nombre}": ${description}`,
      link: `/clients/${id}`,
    });

    return NextResponse.json(
      { adjustment: { ...adjustment, amount: Number(adjustment.amount) } },
      { status: 201 }
    );
  } catch (error) {
    log.error({ err: error }, "Error creating account adjustment");
    return NextResponse.json({ error: "Error al cargar el ajuste" }, { status: 500 });
  }
}
