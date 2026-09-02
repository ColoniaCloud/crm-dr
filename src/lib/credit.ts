import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface CreditCheckResult {
  ok: boolean;
  code?: "NO_CREDIT_TIER" | "CREDIT_LIMIT_EXCEEDED";
  error?: string;
  balance?: number;
  limit?: number;
  tier?: { id: string; code: string; name: string; limit: number };
}

/**
 * Crédito del Cliente: cuánto le debe a Kristall en ventas a plazo.
 *
 * ─── Qué cuenta como crédito, y por qué ────────────────────────────────────
 *
 * Hasta septiembre de 2026 esto solo miraba las ventas de tipo `CONSIGNMENT`, y
 * ahí había un agujero por el que pasaba cualquier monto:
 *
 *   Una venta `REGULAR` no se controlaba —se asume que se cobra en el acto—,
 *   pero después se le podía armar un **plan de cuotas** desde la ficha de la
 *   venta. En ese momento deja de ser al contado y pasa a ser crédito, y nadie
 *   lo estaba mirando. Peor: esa deuda tampoco sumaba para el control
 *   siguiente, así que al mismo Cliente se le podía aprobar después una
 *   consignación por el límite entero como si no debiera nada.
 *
 * Ahora cuenta **todo lo que se pactó a plazo**, que son dos casos:
 *
 *   1. Ventas `CONSIGNMENT` — a plazo por definición.
 *   2. Ventas de cualquier tipo **con un plan de cuotas** no cancelado —
 *      financiar es otorgar crédito, sin importar cómo se haya tipificado la
 *      venta.
 *
 * **Lo que deliberadamente NO cuenta** es una venta `REGULAR` sin plan que
 * todavía no se cobró. Eso es una factura del día, no crédito otorgado, y
 * contarla haría que cualquier venta de mostrador sin cobrar bloquee al Cliente
 * para comprar. Si algún día se decide que también debe contar, es cambiar el
 * `OR` de acá abajo — pero es una decisión de negocio, no técnica.
 */
function ventasAPlazo(excluirVentaId?: string): Prisma.SaleWhereInput {
  return {
    status: { not: "CANCELLED" },
    ...(excluirVentaId ? { id: { not: excluirVentaId } } : {}),
    OR: [
      { type: "CONSIGNMENT" },
      { paymentPlan: { is: { status: { not: "CANCELLED" } } } },
    ],
  };
}

/**
 * Saldo pendiente del Cliente en ventas a plazo.
 *
 * Mismo cálculo `total − pagado` que se usa en el resto de la app
 * (getClientProfile, cuenta corriente); acá acotado a las ventas que otorgan
 * crédito. Las anuladas no cuentan: su deuda está revertida.
 *
 * `excluirVentaId` sirve para preguntar "¿cuánto debe **sin contar** esta
 * venta?", que es lo que hace falta al evaluar una venta que ya existe — si no,
 * se contaría dos veces.
 */
export async function getCreditBalance(
  contactId: string,
  opciones: { excluirVentaId?: string } = {}
): Promise<number> {
  const sales = await prisma.sale.findMany({
    where: { contactId, ...ventasAPlazo(opciones.excluirVentaId) },
    select: { total: true, payments: { select: { amount: true } } },
  });
  return sales.reduce((sum, sale) => {
    const paid = sale.payments.reduce((s, p) => s + Number(p.amount), 0);
    return sum + (Number(sale.total) - paid);
  }, 0);
}

/**
 * @deprecated Nombre viejo de `getCreditBalance`. Se mantiene porque decía
 * "consignación" cuando en realidad es el crédito del Cliente, y ese nombre es
 * parte de por qué el agujero pasó desapercibido: leyendo el código parecía
 * correcto que solo mirara consignaciones.
 */
export const getConsignmentBalance = getCreditBalance;

/**
 * Gate de crédito. Read-only — llamar **antes** de abrir la transacción que
 * crea o modifica, nunca adentro.
 *
 * Dos formas de fallar:
 *   - `NO_CREDIT_TIER`: el contacto no tiene escalafón. Quien llama lo expone
 *     como código propio para que la UI ofrezca asignar uno ahí mismo, en vez
 *     de mostrar un error sin salida.
 *   - `CREDIT_LIMIT_EXCEEDED`: tiene escalafón, pero esta operación lo pasaría.
 *
 * `excluirVentaId` es obligatorio de pensar cuando se evalúa una venta que ya
 * existe (armar un plan sobre una venta ya creada): sin excluirla, su propio
 * monto se cuenta dos veces y el control rechaza de más.
 */
export async function checkCredit(
  contactId: string,
  montoAOtorgar: number,
  opciones: { excluirVentaId?: string } = {}
): Promise<CreditCheckResult> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { creditTier: true },
  });

  if (!contact?.creditTier) {
    return {
      ok: false,
      code: "NO_CREDIT_TIER",
      error: "Este cliente no tiene un escalafón de crédito asignado",
    };
  }

  const balance = await getCreditBalance(contactId, opciones);
  const limit = Number(contact.creditTier.limit);
  const projected = balance + montoAOtorgar;
  const tier = {
    id: contact.creditTier.id,
    code: contact.creditTier.code,
    name: contact.creditTier.name,
    limit,
  };

  if (projected > limit) {
    const money = (n: number) => `$${n.toLocaleString("es-AR")}`;
    return {
      ok: false,
      code: "CREDIT_LIMIT_EXCEEDED",
      error:
        `Supera el límite del escalafón ${contact.creditTier.code} (${money(limit)}). ` +
        `Deuda a plazo actual: ${money(balance)}. Esta operación: ${money(montoAOtorgar)}.`,
      balance,
      limit,
      tier,
    };
  }

  return { ok: true, balance, limit, tier };
}

/** @deprecated Nombre viejo de `checkCredit`. Ver la nota de getConsignmentBalance. */
export const checkConsignmentCredit = checkCredit;
