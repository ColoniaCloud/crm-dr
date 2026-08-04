/**
 * Parte pura del motor de cuenta corriente: solo cálculo, sin acceso a la base.
 *
 * Vive separado de `lib/account.ts` porque los componentes de cliente
 * (`"use client"`) necesitan previsualizar cronogramas y pintar estados, y
 * cualquier import que arrastre Prisma termina en el bundle del navegador.
 *
 * `lib/account.ts` re-exporta todo esto, así que del lado del servidor se puede
 * seguir importando de un solo lugar.
 */

/** Estado de COBRO de una venta. Distinto del estado de ENTREGA (`Sale.status`). */
export type SalePaymentStatus = "PENDING" | "PARTIAL" | "PAID";

/** Estado de una cuota. `OVERDUE` solo existe si además está impaga. */
export type InstallmentStatus = "PENDING" | "PARTIAL" | "PAID" | "OVERDUE";

export type PlanFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "CUSTOM";

/** Redondeo a centavos, para que la suma de imputaciones no acumule basura de punto flotante. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeSalePaymentStatus(total: number, paid: number): SalePaymentStatus {
  if (paid >= total) return "PAID";
  return paid > 0 ? "PARTIAL" : "PENDING";
}

export function computeInstallmentStatus(
  amount: number,
  allocated: number,
  dueDate: Date,
  now: Date = new Date()
): InstallmentStatus {
  if (allocated >= amount) return "PAID";
  if (dueDate < now) return "OVERDUE";
  return allocated > 0 ? "PARTIAL" : "PENDING";
}

export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagada",
  OVERDUE: "Vencida",
};

export const SALE_PAYMENT_STATUS_LABEL: Record<SalePaymentStatus, string> = {
  PENDING: "Sin pagar",
  PARTIAL: "Parcial",
  PAID: "Pagada",
};

export const PLAN_FREQUENCY_LABEL: Record<PlanFrequency, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
  CUSTOM: "A medida",
};

/**
 * Calcula los vencimientos de un plan sin escribir nada.
 *
 * El redondeo de la división se acumula en la ÚLTIMA cuota, así la suma de las
 * cuotas da exactamente el total y no queda un peso colgado.
 */
export function buildInstallmentSchedule(params: {
  total: number;
  installmentCount: number;
  frequency: PlanFrequency;
  firstDueDate: Date;
}): { number: number; dueDate: Date; amount: number }[] {
  const { total, installmentCount, frequency, firstDueDate } = params;

  const base = Math.floor((total / installmentCount) * 100) / 100;
  const ultima = round2(total - base * (installmentCount - 1));

  return Array.from({ length: installmentCount }, (_, i) => {
    const dueDate = new Date(firstDueDate);
    if (frequency === "WEEKLY") dueDate.setDate(dueDate.getDate() + 7 * i);
    else if (frequency === "BIWEEKLY") dueDate.setDate(dueDate.getDate() + 15 * i);
    else dueDate.setMonth(dueDate.getMonth() + i);

    // Un vencimiento es un DÍA del calendario, no un instante. Si se guardara a
    // las 00:00 UTC, al mostrarlo en hora argentina (UTC-3) caería el día
    // anterior: una cuota que vence el 15 se vería como 14. Fijándolo al
    // mediodía queda a salvo de cualquier corrimiento de ±12 h, sin importar
    // desde qué zona horaria se haya cargado.
    dueDate.setHours(12, 0, 0, 0);

    return {
      number: i + 1,
      dueDate,
      amount: i === installmentCount - 1 ? ultima : base,
    };
  });
}
