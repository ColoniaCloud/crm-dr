/**
 * Validación de lo que llega de los formularios de Control de gastos. Server-side:
 * comparte el criterio entre crear y editar un gasto, y entre gasto y recurrente.
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isMonthKey, round2, toARS, validatePeriod } from "@/lib/expenses";

const money = z.coerce.number().positive("El monto tiene que ser mayor a cero").max(9_999_999_999);
const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const expenseSchema = z.object({
  categoryId: z.string().min(1, "Elegí una categoría"),
  description: z.string().trim().min(1, "La descripción es obligatoria").max(191),
  amount: money,
  currency: z.enum(["ARS", "USD"]).default("ARS"),
  exchangeRate: z.coerce.number().positive().max(1_000_000).optional().nullable(),
  paidAt: z.coerce.date({ message: "Fecha de pago inválida" }),
  periodStart: z.string().optional().nullable(),
  periodEnd: z.string().optional().nullable(),
  supplierId: optionalText,
  supplierName: optionalText,
  method: optionalText,
  notes: z.string().trim().max(5000).optional().nullable().transform((v) => (v ? v : null)),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;

/**
 * Del input validado a las columnas de `Expense`. Devuelve error de negocio si
 * el período no cierra, falta la cotización de un gasto en USD o la categoría /
 * el proveedor no existen.
 */
export async function expenseData(input: ExpenseInput) {
  const period = validatePeriod(input.periodStart, input.periodEnd);
  if (!period.ok) return { ok: false as const, error: period.error };

  if (input.currency === "USD" && !input.exchangeRate) {
    return { ok: false as const, error: "Un gasto en USD necesita la cotización (ARS por dólar)" };
  }

  const category = await prisma.expenseCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } });
  if (!category) return { ok: false as const, error: "La categoría no existe" };

  if (input.supplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } });
    if (!supplier) return { ok: false as const, error: "El proveedor no existe" };
  }

  const exchangeRate = input.currency === "USD" ? input.exchangeRate ?? null : null;
  return {
    ok: true as const,
    data: {
      categoryId: input.categoryId,
      description: input.description,
      amount: input.amount,
      currency: input.currency,
      exchangeRate,
      amountARS: round2(toARS(input.amount, input.currency, exchangeRate)),
      paidAt: input.paidAt,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      supplierId: input.supplierId,
      // Con proveedor del CRM el texto libre sobra; se guarda uno u otro.
      supplierName: input.supplierId ? null : input.supplierName,
      method: input.method,
      notes: input.notes,
    },
  };
}

export const recurringSchema = z.object({
  categoryId: z.string().min(1, "Elegí una categoría"),
  description: z.string().trim().min(1, "La descripción es obligatoria").max(191),
  amount: money,
  currency: z.enum(["ARS", "USD"]).default("ARS"),
  supplierId: optionalText,
  supplierName: optionalText,
  method: optionalText,
  dayOfMonth: z.coerce.number().int().min(1).max(28).default(1),
  startMonth: z.string().refine(isMonthKey, "Mes de inicio inválido (AAAA-MM)"),
  endMonth: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isMonthKey(v), "Mes de fin inválido (AAAA-MM)"),
  active: z.boolean().optional(),
  notes: z.string().trim().max(5000).optional().nullable().transform((v) => (v ? v : null)),
});

export type RecurringInput = z.infer<typeof recurringSchema>;

export async function recurringData(input: RecurringInput) {
  if (input.endMonth && input.endMonth < input.startMonth) {
    return { ok: false as const, error: "El mes de fin es anterior al de inicio" };
  }
  const category = await prisma.expenseCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } });
  if (!category) return { ok: false as const, error: "La categoría no existe" };
  if (input.supplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } });
    if (!supplier) return { ok: false as const, error: "El proveedor no existe" };
  }
  return {
    ok: true as const,
    data: {
      categoryId: input.categoryId,
      description: input.description,
      amount: input.amount,
      currency: input.currency,
      supplierId: input.supplierId,
      supplierName: input.supplierId ? null : input.supplierName,
      method: input.method,
      dayOfMonth: input.dayOfMonth,
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      ...(input.active !== undefined ? { active: input.active } : {}),
      notes: input.notes,
    },
  };
}
