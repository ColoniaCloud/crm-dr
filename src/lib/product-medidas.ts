import type { Prisma } from "@prisma/client";
import { m2DelProducto } from "@/lib/rollo-m2";

/**
 * Las medidas de un producto (ancho × largo, en metros) y los m² de sus rollos.
 *
 * En arquitectura son obligatorias si el producto tiene garantía: los rollos se
 * controlan por m², y sin medidas un rollo nace sin m² y no puede generar
 * ninguna instalación. Mejor que el CRM lo pida al crear el producto que
 * enterarse cuando el instalador ya está en la obra.
 */
export function faltanMedidas(datos: {
  category: string | null | undefined;
  conGarantia: boolean;
  width: unknown;
  length: unknown;
}): string | null {
  if (datos.category !== "ARCHITECTURAL" || !datos.conGarantia) return null;
  const w = datos.width == null || datos.width === "" ? null : Number(datos.width);
  const l = datos.length == null || datos.length === "" ? null : Number(datos.length);
  if (m2DelProducto(w, l) == null) {
    return "Una lámina de arquitectura con garantía necesita ancho y largo: con eso se calculan los m² de cada rollo.";
  }
  return null;
}

/**
 * Les pone los m² a los rollos del producto que todavía no los tienen.
 *
 * Es el camino por el que se arreglan los rollos que nacieron antes de que el
 * producto tuviera medidas: se cargan ancho y largo, y los rollos sin m² los
 * toman. Los que ya tienen m² **no se tocan**: pudieron haberse corregido a
 * mano (un resto, un rollo recortado), y pisarlos borraría esa corrección.
 */
export async function completarM2DeRollos(tx: Prisma.TransactionClient, productId: string): Promise<number> {
  const p = await tx.product.findUnique({ where: { id: productId }, select: { width: true, length: true } });
  const m2 = m2DelProducto(p?.width, p?.length);
  if (m2 == null) return 0;
  const r = await tx.warrantyRoll.updateMany({ where: { productId, totalM2: null }, data: { totalM2: m2 } });
  return r.count;
}
