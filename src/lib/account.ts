import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  round2,
  computeInstallmentStatus,
  type InstallmentStatus,
} from "@/lib/account-calc";

// Las funciones puras viven en `account-calc.ts` para que los componentes de
// cliente puedan usarlas sin arrastrar Prisma al bundle del navegador. Se
// re-exportan acá para que del lado del servidor haya un solo lugar de import.
export {
  round2,
  computeSalePaymentStatus,
  computeInstallmentStatus,
  buildInstallmentSchedule,
  INSTALLMENT_STATUS_LABEL,
  SALE_PAYMENT_STATUS_LABEL,
  PLAN_FREQUENCY_LABEL,
} from "@/lib/account-calc";
export type {
  SalePaymentStatus,
  InstallmentStatus,
  PlanFrequency,
} from "@/lib/account-calc";

/**
 * Cuenta corriente del cliente.
 *
 * Implementación única: la usan la ficha del cliente en el CRM, la API del
 * portal y (a través de ella) kristall-web. Si el operador y el cliente ven
 * números distintos, el panel deja de servir — por eso vive en un solo lugar.
 *
 * Dos reglas que atraviesan todo el archivo:
 *
 * 1. El saldo es SIEMPRE `deudas - pagos`. No se lee de ninguna columna
 *    guardada ni depende de las imputaciones a cuotas. Una imputación mal
 *    hecha no puede corromperlo.
 * 2. Nada que se pueda calcular se guarda. "Pagada", "parcial" y "vencida" se
 *    derivan al leer. Un campo guardado necesita que alguien se acuerde de
 *    actualizarlo; uno derivado no puede quedar desfasado.
 */

/** Las ventas anuladas no son deuda. Es el único estado que se excluye. */
const DEUDA_EXCLUIDA: Prisma.SaleWhereInput = { status: { not: "CANCELLED" } };

// ─── Extracto ────────────────────────────────────────────────────────────────

export interface AccountEntry {
  id: string;
  date: string;
  type: "SALE" | "PAYMENT" | "ADJUSTMENT";
  description: string;
  /** Aumenta la deuda del cliente (ventas, notas de débito). */
  debit: number;
  /** La reduce (pagos, notas de crédito). */
  credit: number;
  /** Saldo acumulado hasta este movimiento inclusive. */
  balance: number;
  /** Para linkear al detalle desde el CRM. */
  saleId?: string;
}

export interface AccountInstallment {
  id: string;
  number: number;
  dueDate: string;
  amount: number;
  paid: number;
  remaining: number;
  status: InstallmentStatus;
}

export interface AccountPlan {
  id: string;
  saleId: string;
  saleNumber: number;
  installmentCount: number;
  frequency: string;
  financedTotal: number;
  /** `CANCELLED` es decisión humana; `COMPLETED` se deriva de las cuotas. */
  status: "ACTIVE" | "CANCELLED" | "COMPLETED";
  installments: AccountInstallment[];
  /** Primera cuota impaga, o null si está todo pago. */
  nextDue: AccountInstallment | null;
  overdueCount: number;
}

export interface AccountSummary {
  balance: number;
  totalInvoiced: number;
  totalPaid: number;
  /** Suma de cuotas vencidas e impagas. Cero si el cliente no tiene planes. */
  overdueAmount: number;
  nextDueDate: string | null;
}

export interface ClientAccount {
  summary: AccountSummary;
  entries: AccountEntry[];
  plans: AccountPlan[];
}

/**
 * Extracto completo de un contacto: movimientos ordenados por fecha con saldo
 * corrido, más los planes de cuotas vigentes.
 *
 * El saldo puede dar negativo — es saldo a favor del cliente (sobrepago o nota
 * de crédito) y hay que mostrarlo como tal, no como deuda cero.
 */
export async function getClientAccount(
  contactId: string,
  now: Date = new Date()
): Promise<ClientAccount> {
  const [sales, payments, adjustments] = await Promise.all([
    prisma.sale.findMany({
      where: { contactId, ...DEUDA_EXCLUIDA },
      select: { id: true, number: true, total: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: { contactId, sale: DEUDA_EXCLUIDA },
      select: {
        id: true,
        amount: true,
        method: true,
        paidAt: true,
        saleId: true,
        sale: { select: { number: true } },
      },
    }),
    prisma.accountAdjustment.findMany({
      where: { contactId },
      select: { id: true, type: true, amount: true, description: true, effectiveAt: true },
    }),
  ]);

  const movimientos: Omit<AccountEntry, "balance">[] = [
    ...sales.map((s) => ({
      id: s.id,
      date: s.createdAt.toISOString(),
      type: "SALE" as const,
      description: `Compra #${s.number}`,
      debit: Number(s.total),
      credit: 0,
      saleId: s.id,
    })),
    ...payments.map((p) => ({
      id: p.id,
      date: p.paidAt.toISOString(),
      type: "PAYMENT" as const,
      description: p.sale ? `Pago compra #${p.sale.number}` : "Pago a cuenta",
      debit: 0,
      credit: Number(p.amount),
      saleId: p.saleId ?? undefined,
    })),
    ...adjustments.map((a) => {
      const monto = Number(a.amount);
      return {
        id: a.id,
        date: a.effectiveAt.toISOString(),
        type: "ADJUSTMENT" as const,
        description: a.description,
        debit: monto > 0 ? monto : 0,
        credit: monto < 0 ? -monto : 0,
      };
    }),
  ];

  movimientos.sort((a, b) => a.date.localeCompare(b.date));

  let corrido = 0;
  const entries: AccountEntry[] = movimientos.map((m) => {
    corrido = round2(corrido + m.debit - m.credit);
    return { ...m, balance: corrido };
  });

  const plans = await getClientPlans(contactId, now);

  const overdueAmount = round2(
    plans
      .flatMap((p) => p.installments)
      .filter((i) => i.status === "OVERDUE")
      .reduce((s, i) => s + i.remaining, 0)
  );

  const proximas = plans
    .map((p) => p.nextDue)
    .filter((i): i is AccountInstallment => i !== null)
    .map((i) => i.dueDate)
    .sort();

  return {
    summary: {
      balance: corrido,
      totalInvoiced: round2(entries.reduce((s, e) => s + e.debit, 0)),
      totalPaid: round2(entries.reduce((s, e) => s + e.credit, 0)),
      overdueAmount,
      nextDueDate: proximas[0] ?? null,
    },
    entries,
    plans,
  };
}

/** Saldo pendiente de un contacto. Atajo para cuando no hace falta el extracto entero. */
export async function getClientBalance(contactId: string): Promise<number> {
  const [sales, payments, adjustments] = await Promise.all([
    prisma.sale.aggregate({ where: { contactId, ...DEUDA_EXCLUIDA }, _sum: { total: true } }),
    prisma.payment.aggregate({ where: { contactId, sale: DEUDA_EXCLUIDA }, _sum: { amount: true } }),
    prisma.accountAdjustment.aggregate({ where: { contactId }, _sum: { amount: true } }),
  ]);
  return round2(
    Number(sales._sum.total ?? 0) -
      Number(payments._sum.amount ?? 0) +
      Number(adjustments._sum.amount ?? 0)
  );
}

// ─── Planes de cuotas ────────────────────────────────────────────────────────

export async function getClientPlans(
  contactId: string,
  now: Date = new Date()
): Promise<AccountPlan[]> {
  const planes = await prisma.paymentPlan.findMany({
    where: { sale: { contactId, ...DEUDA_EXCLUIDA } },
    include: {
      sale: { select: { id: true, number: true } },
      installments: {
        orderBy: { number: "asc" },
        include: { allocations: { select: { amount: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return planes.map((plan) => {
    const installments: AccountInstallment[] = plan.installments.map((cuota) => {
      const amount = Number(cuota.amount);
      const paid = round2(cuota.allocations.reduce((s, a) => s + Number(a.amount), 0));
      return {
        id: cuota.id,
        number: cuota.number,
        dueDate: cuota.dueDate.toISOString(),
        amount,
        paid,
        remaining: round2(Math.max(0, amount - paid)),
        status: computeInstallmentStatus(amount, paid, cuota.dueDate, now),
      };
    });

    const impagas = installments.filter((i) => i.status !== "PAID");

    return {
      id: plan.id,
      saleId: plan.sale.id,
      saleNumber: plan.sale.number,
      installmentCount: plan.installmentCount,
      frequency: plan.frequency,
      financedTotal: Number(plan.financedTotal),
      status:
        plan.status === "CANCELLED"
          ? ("CANCELLED" as const)
          : impagas.length === 0
            ? ("COMPLETED" as const)
            : ("ACTIVE" as const),
      installments,
      nextDue: impagas[0] ?? null,
      overdueCount: installments.filter((i) => i.status === "OVERDUE").length,
    };
  });
}

// ─── Imputación de pagos a cuotas ────────────────────────────────────────────

/**
 * Reconstruye desde cero las imputaciones de todas las cuotas de una venta,
 * aplicando los pagos por orden de fecha a la cuota impaga más vieja (FIFO).
 *
 * Es un rebuild completo y no un ajuste incremental, a propósito: así la
 * función es idempotente y da el mismo resultado sin importar en qué orden se
 * cargaron, editaron o borraron los pagos. Llamarla de más nunca hace daño.
 *
 * Es lo que permite crear un plan sobre una venta que ya venía con pagos
 * sueltos: los pagos existentes se imputan hacia atrás sin anular nada.
 *
 * Recordar: esto NO afecta el saldo, que siempre es total - pagos. Solo decide
 * qué cuota se muestra como cubierta.
 */
export async function rebuildAllocations(
  saleId: string,
  tx: Prisma.TransactionClient = prisma
): Promise<void> {
  const plan = await tx.paymentPlan.findUnique({
    where: { saleId },
    include: { installments: { orderBy: { number: "asc" } } },
  });

  // Sin plan (o cancelado) no hay nada que imputar: la venta se comporta como
  // pagos libres. Se limpia lo que hubiera quedado de un plan anterior.
  const pagos = await tx.payment.findMany({
    where: { saleId },
    orderBy: { paidAt: "asc" },
    select: { id: true, amount: true },
  });

  await tx.paymentAllocation.deleteMany({
    where: { paymentId: { in: pagos.map((p) => p.id) } },
  });

  if (!plan || plan.status === "CANCELLED" || plan.installments.length === 0) return;

  const pendiente = plan.installments.map((c) => ({ id: c.id, resto: Number(c.amount) }));
  const nuevas: { paymentId: string; installmentId: string; amount: number }[] = [];

  for (const pago of pagos) {
    let disponible = Number(pago.amount);

    for (const cuota of pendiente) {
      if (disponible <= 0) break;
      if (cuota.resto <= 0) continue;

      const aplicar = round2(Math.min(disponible, cuota.resto));
      if (aplicar <= 0) continue;

      nuevas.push({ paymentId: pago.id, installmentId: cuota.id, amount: aplicar });
      cuota.resto = round2(cuota.resto - aplicar);
      disponible = round2(disponible - aplicar);
    }
    // Si sobra plata (sobrepago del plan) queda sin imputar. Sigue contando
    // para el saldo, que es lo que importa.
  }

  if (nuevas.length > 0) {
    await tx.paymentAllocation.createMany({
      data: nuevas.map((n) => ({
        paymentId: n.paymentId,
        installmentId: n.installmentId,
        amount: new Prisma.Decimal(n.amount),
      })),
    });
  }
}
