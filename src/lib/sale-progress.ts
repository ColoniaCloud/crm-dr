/**
 * El estado de una venta tal como lo ve el operador: en qué punto del circuito
 * vender → entregar → firmar está.
 *
 * Se DERIVA de `Sale.status` y `Remito.signedAt`, no se guarda. No hace falta
 * una columna: "entregada sin firma" es exactamente `DELIVERED` con el remito
 * sin firmar. Guardarlo aparte sería una segunda fuente de verdad que se
 * desincroniza la primera vez que alguien firme por otro camino.
 *
 * Sin dependencias de servidor: lo usan la lista de ventas, la ficha y Remitos.
 */

export type SaleProgress =
  | "PENDING"
  | "CONFIRMED"
  | "DELIVERED_UNSIGNED"
  | "DELIVERED_SIGNED"
  | "CANCELLED";

export function saleProgress(
  status: string,
  remito: { signedAt: string | Date | null } | null | undefined
): SaleProgress {
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "PENDING") return "PENDING";
  if (status === "CONFIRMED") return "CONFIRMED";
  return remito?.signedAt ? "DELIVERED_SIGNED" : "DELIVERED_UNSIGNED";
}

export const SALE_PROGRESS_LABEL: Record<SaleProgress, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada, sin entregar",
  DELIVERED_UNSIGNED: "Entregada, sin firma",
  DELIVERED_SIGNED: "Entregada y firmada",
  CANCELLED: "Anulada",
};

export const SALE_PROGRESS_BADGE_CLASS: Record<SaleProgress, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-0",
  CONFIRMED: "bg-blue-100 text-blue-800 border-0",
  DELIVERED_UNSIGNED: "bg-orange-100 text-orange-800 border-0",
  DELIVERED_SIGNED: "bg-green-100 text-green-800 border-0",
  CANCELLED: "bg-red-100 text-red-800 border-0",
};

/** En el orden del circuito, para el filtro de la lista. */
export const SALE_PROGRESS_ORDER: SaleProgress[] = [
  "PENDING",
  "CONFIRMED",
  "DELIVERED_UNSIGNED",
  "DELIVERED_SIGNED",
  "CANCELLED",
];
