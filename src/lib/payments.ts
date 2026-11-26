import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeSaleRemaining, rebuildAllocations, round2, toCents } from "@/lib/account";
import { ensurePaymentAuditTable } from "@/lib/notifications";

/**
 * Registro de pagos: el ÚNICO camino por el que nace un `Payment`.
 *
 * Antes había tres (la web del CRM, la app móvil y la confirmación de una
 * declaración del portal) y cada uno validaba otra cosa: la web no tenía tope ni
 * miraba si la venta estaba anulada, y aceptaba un `contactId` distinto del de la
 * venta. Ninguno corría en una transacción, así que dos cobros a la vez sobre la
 * misma venta pasaban los dos el tope, y un reintento creaba un segundo pago.
 *
 * Acá, todo pasa con la fila de la venta bloqueada (`SELECT … FOR UPDATE`): el
 * saldo que se lee es el que hay de verdad cuando se escribe, y los cobros
 * concurrentes sobre una misma venta se hacen de a uno.
 */

type Tx = Prisma.TransactionClient;

export const PAYMENT_METHODS = ["CASH", "TRANSFER", "CHECK", "CARD", "OTHER"] as const;
export type PaymentMethodCode = (typeof PAYMENT_METHODS)[number];

/**
 * Bloquea la fila de la venta hasta que termine la transacción. Todo lo que
 * cambia el saldo de una venta (pagos, edición del total, anulación) pasa por
 * acá, así que dos de esas operaciones sobre la misma venta no se pisan.
 */
export async function lockSale(tx: Tx, saleId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId} FOR UPDATE`;
}

export interface SaleBalance {
  total: number;
  /** Suma de los pagos registrados. */
  paid: number;
  /** Devuelto a crédito (nota de crédito sin plata de por medio). */
  creditedReturns: number;
  /** Devuelto en efectivo: plata que el cliente pagó y se le reintegró. */
  cashReturns: number;
  /** Lo que el cliente pagó y todavía tenemos: pagos menos reintegros en efectivo. */
  netPaid: number;
  /** Lo que todavía debe por esta venta. Negativo = saldo a favor. */
  remaining: number;
}

/**
 * Saldos de varias ventas en tres consultas agregadas, sin traer cada pago.
 * Las ventas que no existen no aparecen en el mapa.
 */
export async function getSaleBalances(
  saleIds: string[],
  tx: Tx = prisma
): Promise<Map<string, SaleBalance>> {
  const result = new Map<string, SaleBalance>();
  if (saleIds.length === 0) return result;

  const [sales, pagos, devoluciones] = await Promise.all([
    tx.sale.findMany({ where: { id: { in: saleIds } }, select: { id: true, total: true } }),
    tx.payment.groupBy({
      by: ["saleId"],
      where: { saleId: { in: saleIds } },
      _sum: { amount: true },
    }),
    tx.saleReturn.groupBy({
      by: ["saleId", "refund"],
      where: { saleId: { in: saleIds } },
      _sum: { total: true },
    }),
  ]);

  const pagado = new Map(pagos.map((p) => [p.saleId, Number(p._sum.amount ?? 0)]));
  const credito = new Map<string, number>();
  const efectivo = new Map<string, number>();
  for (const d of devoluciones) {
    const destino = d.refund === "CASH" ? efectivo : credito;
    destino.set(d.saleId, (destino.get(d.saleId) ?? 0) + Number(d._sum.total ?? 0));
  }

  for (const s of sales) {
    const total = Number(s.total);
    const paid = round2(pagado.get(s.id) ?? 0);
    const creditedReturns = round2(credito.get(s.id) ?? 0);
    const cashReturns = round2(efectivo.get(s.id) ?? 0);
    result.set(s.id, {
      total,
      paid,
      creditedReturns,
      cashReturns,
      netPaid: round2(paid - cashReturns),
      remaining: computeSaleRemaining({ total, paid, creditedReturns }),
    });
  }
  return result;
}

export async function getSaleBalance(saleId: string, tx: Tx = prisma): Promise<SaleBalance | null> {
  return (await getSaleBalances([saleId], tx)).get(saleId) ?? null;
}

export interface RegisterPaymentInput {
  saleId: string;
  amount: number;
  method: string;
  reference?: string | null;
  notes?: string | null;
  /** Clave de reintento del cliente (ver `Payment.clientRequestId`). */
  clientRequestId?: string | null;
  /**
   * Si viene, el pago tiene que ser de este contacto. La web del CRM lo mandaba
   * y se guardaba tal cual: un pago podía quedar en la cuenta de otra persona.
   */
  expectedContactId?: string | null;
}

export type RegisterPaymentResult =
  | {
      ok: true;
      paymentId: string;
      /** true = la clave ya se había usado: se devuelve el pago existente, no se creó otro. */
      duplicate: boolean;
    }
  | { ok: false; status: number; error: string };

function formatoPesos(n: number): string {
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

/**
 * Valida y crea un pago dentro de una transacción que YA tiene la venta
 * bloqueada o que la bloquea acá. Para usar desde otra transacción (la
 * confirmación de una declaración) en vez de `registerPayment`.
 */
export async function registerPaymentTx(
  tx: Tx,
  input: RegisterPaymentInput
): Promise<RegisterPaymentResult> {
  const { saleId, amount, method } = input;

  if (!Number.isFinite(amount) || toCents(amount) <= 0) {
    return { ok: false, status: 400, error: "El monto tiene que ser mayor a cero." };
  }

  await lockSale(tx, saleId);

  // La clave se mira DESPUÉS del bloqueo: dos reintentos simultáneos con la
  // misma clave esperan en fila, y el segundo encuentra el pago del primero.
  if (input.clientRequestId) {
    const previo = await tx.payment.findUnique({
      where: { clientRequestId: input.clientRequestId },
      select: { id: true, saleId: true },
    });
    if (previo) {
      if (previo.saleId !== saleId) {
        return { ok: false, status: 409, error: "La clave del pago ya se usó en otra venta." };
      }
      return { ok: true, paymentId: previo.id, duplicate: true };
    }
  }

  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    select: { id: true, number: true, contactId: true, status: true },
  });
  if (!sale) return { ok: false, status: 404, error: "Venta no encontrada" };

  if (input.expectedContactId && input.expectedContactId !== sale.contactId) {
    return {
      ok: false,
      status: 400,
      error: `La venta #${sale.number} es de otro cliente.`,
    };
  }

  // Una venta anulada ya devolvió su stock: cobrar contra ella deja plata
  // imputada a algo que no existe, y la cuenta corriente la ignora.
  if (sale.status === "CANCELLED") {
    return {
      ok: false,
      status: 409,
      error: `La venta #${sale.number} está anulada: no se le pueden registrar pagos.`,
    };
  }

  const balance = await getSaleBalance(saleId, tx);
  const remaining = balance?.remaining ?? 0;
  if (toCents(amount) > toCents(remaining)) {
    return {
      ok: false,
      status: 409,
      error:
        remaining > 0
          ? `El saldo de la venta #${sale.number} es ${formatoPesos(remaining)}. No se puede cobrar de más.`
          : `La venta #${sale.number} ya está saldada.`,
    };
  }

  const payment = await tx.payment.create({
    data: {
      saleId,
      contactId: sale.contactId,
      amount: new Prisma.Decimal(round2(amount)),
      method,
      reference: input.reference || null,
      notes: input.notes || null,
      clientRequestId: input.clientRequestId || null,
    },
    select: { id: true },
  });

  // Si la venta tiene plan de cuotas, imputa este pago. Sin plan no hace nada.
  await rebuildAllocations(saleId, tx);

  return { ok: true, paymentId: payment.id, duplicate: false };
}

/** Registra un pago en su propia transacción. Ver `registerPaymentTx`. */
export async function registerPayment(input: RegisterPaymentInput): Promise<RegisterPaymentResult> {
  try {
    return await prisma.$transaction((tx) => registerPaymentTx(tx, input));
  } catch (error) {
    // Red de seguridad del índice único: si igual se coló un duplicado de la
    // clave, el pago ya existe y el reintento tiene que verlo como hecho.
    if (
      input.clientRequestId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const previo = await prisma.payment.findUnique({
        where: { clientRequestId: input.clientRequestId },
        select: { id: true, saleId: true },
      });
      if (previo && previo.saleId === input.saleId) {
        return { ok: true, paymentId: previo.id, duplicate: true };
      }
    }
    throw error;
  }
}

/** Registra el alta en el historial de pagos de la venta (antes solo se veían ediciones y borrados). */
export async function logPaymentCreated(params: {
  saleId: string;
  paymentId: string;
  userId: string;
  amount: number;
  method: string;
  description: string;
}): Promise<void> {
  await ensurePaymentAuditTable();
  await prisma.$executeRaw`
    INSERT INTO payment_audit_logs (id, saleId, paymentId, userId, action, oldValues, newValues, description, createdAt)
    VALUES (
      ${crypto.randomUUID()},
      ${params.saleId},
      ${params.paymentId},
      ${params.userId},
      'CREATED',
      NULL,
      ${JSON.stringify({ amount: params.amount, method: params.method })},
      ${params.description},
      NOW(3)
    )
  `;
}
