import { prisma } from "@/lib/prisma";
import { calendarDaysBetween, formatLocalDate } from "@/lib/agents/schedule";
import {
  activeSteps,
  portalAccountLink,
  renderTemplate,
  type CollectionsConfig,
  type CollectionsStep,
} from "@/lib/agents/collections/config";

/**
 * Qué se debe y en qué paso de la secuencia está cada deuda. Todo acá es código
 * determinista contra la base: la IA nunca decide a quién se le cobra.
 *
 * Una deuda es una de dos cosas:
 *   - una cuota impaga de un plan activo (vence en su `dueDate`), o
 *   - una venta con saldo y SIN plan activo (vence a `defaultTermDays` de la
 *     fecha de la venta).
 *
 * Tres guardas para no reclamarle a quien no debe:
 *   1. El monto de la cuota se topea en el saldo de la venta (total − pagos),
 *      que es la única fuente de verdad del saldo — las imputaciones a cuotas
 *      son orientativas (ver el comentario de Payment.allocations).
 *   2. Y se topea en el saldo de la cuenta del cliente, que descuenta notas de
 *      crédito y ajustes: un cliente con saldo a favor no recibe reclamos.
 *   3. Si el cliente declaró un pago de esa venta desde el Portal y nadie lo
 *      revisó todavía, la deuda queda en pausa.
 */

export type DebtSkipReason = "NO_EMAIL" | "DECLARATION_PENDING" | "EXCLUDED" | "ESCALATED" | "NOT_YET";

export interface Debt {
  contactId: string;
  contactName: string;
  hasEmail: boolean;
  saleId: string;
  saleNumber: number;
  currency: string;
  installmentId: string | null;
  installmentLabel: string;
  amount: number;
  dueDate: Date;
  /** Positivo = días vencida; negativo = días que faltan. */
  daysPastDue: number;
  step: CollectionsStep | null;
  skip: DebtSkipReason | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function formatAmount(amount: number, currency: string): string {
  const num = amount.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return currency === "USD" ? `US$ ${num}` : `$ ${num}`;
}

export function displayName(c: { firstName: string; lastName: string; company: string | null }): string {
  const persona = `${c.firstName} ${c.lastName}`.trim();
  const empresa = c.company?.trim();
  if (persona && empresa) return `${persona} (${empresa})`;
  return persona || empresa || "Cliente";
}

/** Nombre para el saludo del mail: el de pila si hay, si no la empresa. */
function greetingName(c: { firstName: string; company: string | null }): string {
  return c.firstName?.trim() || c.company?.trim() || "";
}

/** El paso más avanzado que ya le corresponde a una deuda, o null si todavía es temprano. */
export function stepFor(daysPastDue: number, config: CollectionsConfig): CollectionsStep | null {
  let actual: CollectionsStep | null = null;
  for (const s of activeSteps(config)) if (s.offsetDays <= daysPastDue) actual = s;
  return actual;
}

export async function computeDebts(config: CollectionsConfig, now: Date = new Date()): Promise<Debt[]> {
  const sales = await prisma.sale.findMany({
    where: { status: { in: ["CONFIRMED", "DELIVERED"] } },
    select: {
      id: true,
      number: true,
      total: true,
      currency: true,
      createdAt: true,
      contactId: true,
      contact: { select: { firstName: true, lastName: true, company: true, email: true } },
      payments: { select: { amount: true } },
      paymentPlan: {
        select: {
          status: true,
          installmentCount: true,
          installments: {
            orderBy: { number: "asc" },
            select: { id: true, number: true, dueDate: true, amount: true, allocations: { select: { amount: true } } },
          },
        },
      },
      paymentDeclarations: { where: { status: "PENDING" }, select: { id: true } },
    },
  });

  const conSaldo = sales
    .map((s) => ({ ...s, remaining: round2(Number(s.total) - s.payments.reduce((t, p) => t + Number(p.amount), 0)) }))
    .filter((s) => s.remaining > 0.01);
  if (conSaldo.length === 0) return [];

  const saldoCuenta = await accountBalances([...new Set(conSaldo.map((s) => s.contactId))]);
  const excluidos = new Set(config.excludedContactIds);
  const debts: Debt[] = [];

  for (const s of conSaldo) {
    const contactName = displayName(s.contact);
    const hasEmail = Boolean(s.contact.email?.trim());
    const base = {
      contactId: s.contactId,
      contactName,
      hasEmail,
      saleId: s.id,
      saleNumber: s.number,
      currency: s.currency,
    };
    // Lo que se puede reclamar de esta venta, con las guardas 1 y 2.
    let disponible = Math.min(s.remaining, saldoCuenta.get(s.contactId) ?? 0);
    if (disponible <= 0.01) continue;

    const piezas: Array<Pick<Debt, "installmentId" | "installmentLabel" | "amount" | "dueDate">> = [];
    if (s.paymentPlan?.status === "ACTIVE") {
      for (const c of s.paymentPlan.installments) {
        const impago = round2(Number(c.amount) - c.allocations.reduce((t, a) => t + Number(a.amount), 0));
        if (impago <= 0.01) continue;
        const monto = round2(Math.min(impago, disponible));
        if (monto <= 0.01) break;
        disponible -= monto;
        piezas.push({
          installmentId: c.id,
          installmentLabel: `(cuota ${c.number} de ${s.paymentPlan.installmentCount})`,
          amount: monto,
          dueDate: c.dueDate,
        });
      }
    } else {
      piezas.push({
        installmentId: null,
        installmentLabel: "",
        amount: round2(disponible),
        dueDate: new Date(s.createdAt.getTime() + config.defaultTermDays * 86_400_000),
      });
    }

    for (const p of piezas) {
      const daysPastDue = calendarDaysBetween(p.dueDate, now);
      const step = stepFor(daysPastDue, config);
      let skip: DebtSkipReason | null = null;
      if (!step) skip = "NOT_YET";
      else if (daysPastDue > config.escalateAfterDays) skip = "ESCALATED";
      else if (excluidos.has(s.contactId)) skip = "EXCLUDED";
      else if (s.paymentDeclarations.length > 0) skip = "DECLARATION_PENDING";
      else if (!hasEmail) skip = "NO_EMAIL";
      debts.push({ ...base, ...p, daysPastDue, step, skip });
    }
  }

  return debts.sort((a, b) => b.daysPastDue - a.daysPastDue);
}

/**
 * Saldo de la cuenta corriente por contacto: ventas no anuladas − pagos +
 * ajustes (las notas de crédito entran como ajustes negativos). Es la misma
 * cuenta que `getClientBalance`, hecha de una vez para todos los contactos.
 */
async function accountBalances(contactIds: string[]): Promise<Map<string, number>> {
  const [ventas, pagos, ajustes] = await Promise.all([
    prisma.sale.groupBy({
      by: ["contactId"],
      where: { contactId: { in: contactIds }, status: { not: "CANCELLED" } },
      _sum: { total: true },
    }),
    prisma.payment.groupBy({
      by: ["contactId"],
      where: { contactId: { in: contactIds }, sale: { status: { not: "CANCELLED" } } },
      _sum: { amount: true },
    }),
    prisma.accountAdjustment.groupBy({
      by: ["contactId"],
      where: { contactId: { in: contactIds } },
      _sum: { amount: true },
    }),
  ]);
  const saldo = new Map<string, number>();
  for (const v of ventas) saldo.set(v.contactId, Number(v._sum.total ?? 0));
  for (const p of pagos) saldo.set(p.contactId, (saldo.get(p.contactId) ?? 0) - Number(p._sum.amount ?? 0));
  for (const a of ajustes) saldo.set(a.contactId, (saldo.get(a.contactId) ?? 0) + Number(a._sum.amount ?? 0));
  return saldo;
}

export function dedupeKeyFor(debt: Debt): string | null {
  if (!debt.step) return null;
  return debt.installmentId ? `inst:${debt.installmentId}:${debt.step.key}` : `sale:${debt.saleId}:${debt.step.key}`;
}

/** Variables de plantilla. El email del cliente NO está acá: lo pone el envío, en el servidor. */
export async function templateVars(debt: Debt, config: CollectionsConfig, now: Date = new Date()) {
  const contacto = await prisma.contact.findUnique({
    where: { id: debt.contactId },
    select: { firstName: true, company: true },
  });
  return {
    nombre: contacto ? greetingName(contacto) : debt.contactName,
    monto: formatAmount(debt.amount, debt.currency),
    venta: String(debt.saleNumber),
    cuota: debt.installmentLabel,
    vencimiento: formatLocalDate(debt.dueDate),
    dias: String(Math.abs(calendarDaysBetween(debt.dueDate, now))),
    link_cuenta: portalAccountLink(),
    firma: config.signature,
  };
}

export async function renderForDebt(
  debt: Debt,
  subject: string,
  body: string,
  config: CollectionsConfig,
  now: Date = new Date()
) {
  const vars = await templateVars(debt, config, now);
  return { subject: renderTemplate(subject, vars), body: renderTemplate(body, vars) };
}
