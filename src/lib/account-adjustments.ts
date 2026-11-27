/**
 * Ajustes de cuenta corriente que se cargan a mano desde la ficha del cliente.
 *
 * Sin Prisma a propósito: lo usan la ruta y el formulario (componente de
 * cliente), y cualquier import de Prisma terminaría en el bundle del navegador.
 *
 * `REFUND` y las notas de crédito de una devolución NO se cargan acá: las crea
 * `createSaleReturn` junto con la devolución de la mercadería.
 */

export const MANUAL_ADJUSTMENT_TYPES = ["DEBIT_NOTE", "CREDIT_NOTE", "WRITE_OFF", "OPENING_BALANCE"] as const;
export type ManualAdjustmentType = (typeof MANUAL_ADJUSTMENT_TYPES)[number];

export const MANUAL_ADJUSTMENT_LABEL: Record<ManualAdjustmentType, string> = {
  DEBIT_NOTE: "Nota de débito (suma deuda)",
  CREDIT_NOTE: "Nota de crédito (resta deuda)",
  WRITE_OFF: "Condonación (resta deuda)",
  OPENING_BALANCE: "Saldo inicial (suma deuda)",
};

/**
 * `AccountAdjustment.amount` lleva signo: positivo aumenta la deuda del cliente,
 * negativo la reduce. En el formulario el monto siempre se escribe positivo y el
 * signo lo pone el tipo, para que nadie tenga que acordarse de la convención.
 */
export function signedAdjustmentAmount(type: ManualAdjustmentType, amount: number): number {
  const abs = Math.abs(amount);
  return type === "CREDIT_NOTE" || type === "WRITE_OFF" ? -abs : abs;
}
