import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { getRollByCode } from "@/lib/warranty";
import { saldoDeRollo } from "@/lib/rollo-m2";

const log = createLogger("api/warranty-rolls/[code]");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { code } = await params;
    const roll = await getRollByCode(code);
    if (!roll) {
      return NextResponse.json({ error: "Código de rollo no encontrado" }, { status: 404 });
    }

    // Cuánto trae, cuánto se usó y cuánto queda (ver rollo-m2.ts).
    const saldo = await saldoDeRollo(prisma, roll.id);
    return NextResponse.json({ ...roll, saldo });
  } catch (error) {
    log.error({ err: error }, "Error fetching warranty roll");
    return NextResponse.json({ error: "Error al buscar el código" }, { status: 500 });
  }
}

/**
 * Corrige los m² de un rollo: un resto, un rollo recortado o uno que nació
 * antes de que el producto tuviera medidas. ADMIN+.
 *
 * `totalM2: null` lo deja sin dato propio y vuelve a valer ancho × largo del
 * producto. No puede quedar por debajo de lo ya usado: sería un saldo negativo
 * que nadie sabría explicar.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const { code } = await params;
    const body = await request.json().catch(() => ({}));
    const raw = body?.totalM2;
    const totalM2 = raw === null || raw === "" ? null : Number(raw);
    if (totalM2 !== null && (!Number.isFinite(totalM2) || totalM2 <= 0 || totalM2 > 100_000)) {
      return NextResponse.json({ error: "Los m² tienen que ser un número mayor a cero" }, { status: 400 });
    }

    const roll = await prisma.warrantyRoll.findUnique({
      where: { fullRollCode: code },
      select: { id: true, fullRollCode: true, totalM2: true },
    });
    if (!roll) return NextResponse.json({ error: "Rollo no encontrado" }, { status: 404 });

    const saldo = await saldoDeRollo(prisma, roll.id);
    if (totalM2 !== null && saldo && totalM2 < saldo.usedM2) {
      return NextResponse.json(
        { error: `Del rollo ya se usaron ${saldo.usedM2} m²: el total no puede ser menor.` },
        { status: 400 }
      );
    }

    await prisma.warrantyRoll.update({ where: { id: roll.id }, data: { totalM2 } });
    await logOperatorAction({
      userId: session.user.id,
      action: "UPDATE_ROLL_M2",
      entityType: "WARRANTY_ROLL",
      entityId: roll.id,
      description: `Cambió los m² del rollo ${roll.fullRollCode}: ${roll.totalM2?.toString() ?? "sin dato"} → ${totalM2 ?? "los del producto"}`,
      link: `/warranty-claims`,
    });

    return NextResponse.json({ ok: true, saldo: await saldoDeRollo(prisma, roll.id) });
  } catch (error) {
    log.error({ err: error }, "Error updating roll m2");
    return NextResponse.json({ error: "Error al guardar los m²" }, { status: 500 });
  }
}
