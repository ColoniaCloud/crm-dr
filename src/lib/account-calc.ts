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

/** Compara importes en centavos: el ruido del punto flotante no deja pasar un centavo de más. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Saldo de UNA venta: lo que el cliente todavía debe por ella.
 *
 * No es `total - pagos`. Una devolución con nota de crédito baja la deuda de la
 * venta aunque no haya movido un peso: si se compraron $100.000, se devolvieron
 * $40.000 a crédito y no se pagó nada, se deben $60.000. Contar solo los pagos
 * hacía que el POS le pidiera al taller los $100.000 enteros — y el tope del
 * backend lo dejaba cobrar — mientras la ficha del cliente decía $60.000.
 *
 * Una devolución en EFECTIVO no cambia el saldo: acredita la mercadería y le
 * devuelve al cliente esa misma plata (en la cuenta corriente son una nota de
 * crédito y un REFUND que se cancelan). Por eso entra solo lo devuelto a crédito.
 *
 * Puede dar negativo (se cobró de más, o se acreditó más de lo que se debía): es
 * saldo a favor, y quien lo muestre decide si lo acota a cero.
 */
export function computeSaleRemaining(params: {
  total: number;
  paid: number;
  /** Suma de `SaleReturn.total` de las devoluciones con `refund: CREDIT_NOTE`. */
  creditedReturns: number;
}): number {
  return round2(params.total - params.paid - params.creditedReturns);
}

/** Lo devuelto a crédito de una venta: las devoluciones que no fueron en efectivo. */
export function sumCreditedReturns(returns: { total: unknown; refund: string }[]): number {
  return round2(
    returns.filter((r) => r.refund !== "CASH").reduce((s, r) => s + Number(r.total), 0)
  );
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
