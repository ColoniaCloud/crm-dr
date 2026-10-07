import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Los m² de un rollo: cuánto trae, cuánto se usó, cuánto queda.
 *
 * **Un solo contador para todos.** Antes había dos que no se hablaban: Mi
 * Taller descontaba las líneas de las órdenes de trabajo, y las instalaciones
 * generadas desde Stock no descontaban nada. Ahora el consumo de un rollo es la
 * suma de las dos fuentes, y cada una se cuenta una sola vez:
 *
 * - **Órdenes de trabajo:** sus líneas (`WorkOrderItem.squareMetersUsed`).
 *   TERMINADA/ENTREGADA es usado; PRESUPUESTADA/AGENDADA/EN_PROCESO, reservado.
 *   La garantía que genera una OT deja `m2Used` en null justamente para no
 *   contar el mismo material dos veces.
 * - **Instalaciones generadas desde Stock:** su `m2Used`, que declara el
 *   instalador (material, con merma). Las anuladas no cuentan.
 *
 * El total es `WarrantyRoll.totalM2`; si el rollo es anterior a ese campo, se
 * cae a ancho × largo del producto. Sin ninguno de los dos, null: no se sabe.
 */

export interface SaldoRollo {
  totalM2: number | null;
  usedM2: number;
  reservedM2: number;
  /** Lo que físicamente queda: total − usado. */
  remainingM2: number | null;
  /** Con lo que se puede contar para algo nuevo: total − usado − reservado. */
  availableM2: number | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** m² de lámina según las medidas del producto, o null si falta alguna. */
export function m2DelProducto(
  width: { toString(): string } | number | null | undefined,
  length: { toString(): string } | number | null | undefined
): number | null {
  if (width == null || length == null) return null;
  const m2 = Number(width) * Number(length);
  return Number.isFinite(m2) && m2 > 0 ? redondear(m2) : null;
}

export async function saldosDeRollos(db: Db, rollIds: string[]): Promise<Map<string, SaldoRollo>> {
  const resultado = new Map<string, SaldoRollo>();
  if (rollIds.length === 0) return resultado;

  const [rolls, consumido, reservado, deStock] = await Promise.all([
    db.warrantyRoll.findMany({
      where: { id: { in: rollIds } },
      select: { id: true, totalM2: true, product: { select: { width: true, length: true } } },
    }),
    db.workOrderItem.groupBy({
      by: ["rollId"],
      where: { rollId: { in: rollIds }, workOrder: { status: { in: ["TERMINADA", "ENTREGADA"] } } },
      _sum: { squareMetersUsed: true },
    }),
    db.workOrderItem.groupBy({
      by: ["rollId"],
      where: {
        rollId: { in: rollIds },
        workOrder: { status: { in: ["PRESUPUESTADA", "AGENDADA", "EN_PROCESO"] } },
      },
      _sum: { squareMetersUsed: true },
    }),
    db.warrantyInstallation.groupBy({
      by: ["rollId"],
      where: { rollId: { in: rollIds }, status: { not: "VOIDED" }, m2Used: { not: null } },
      _sum: { m2Used: true },
    }),
  ]);

  const porRollo = (filas: { rollId: string | null; _sum: Record<string, unknown> }[], campo: string) =>
    new Map(filas.filter((f) => f.rollId).map((f) => [f.rollId as string, Number(f._sum[campo] ?? 0)]));
  const usadoOT = porRollo(consumido, "squareMetersUsed");
  const reservadoOT = porRollo(reservado, "squareMetersUsed");
  const usadoStock = porRollo(deStock, "m2Used");

  for (const r of rolls) {
    const totalM2 = r.totalM2 != null ? Number(r.totalM2) : m2DelProducto(r.product.width, r.product.length);
    const usedM2 = redondear((usadoOT.get(r.id) ?? 0) + (usadoStock.get(r.id) ?? 0));
    const reservedM2 = redondear(reservadoOT.get(r.id) ?? 0);
    resultado.set(r.id, {
      totalM2,
      usedM2,
      reservedM2,
      remainingM2: totalM2 == null ? null : redondear(totalM2 - usedM2),
      availableM2: totalM2 == null ? null : redondear(totalM2 - usedM2 - reservedM2),
    });
  }
  return resultado;
}

export async function saldoDeRollo(db: Db, rollId: string): Promise<SaldoRollo | null> {
  return (await saldosDeRollos(db, [rollId])).get(rollId) ?? null;
}

/** «12,5 m²» con coma decimal. */
export function formatM2(n: number): string {
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} m²`;
}
