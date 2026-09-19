import { prisma } from "@/lib/prisma";
import { Prisma, type PaymentDeclarationStatus } from "@prisma/client";
import { notifyAdmins, logOperatorAction } from "@/lib/notifications";
import { rebuildAllocations } from "@/lib/account";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/payment-declarations");

/**
 * "Ya pagué esta cuota", declarado por un Cliente desde el Portal.
 *
 * A propósito **no** crea un `Payment` real: eso movería el saldo con solo la
 * palabra del cliente, sin que nadie de la empresa haya visto la plata. Queda
 * `PENDING`, avisa a los admins (mismo patrón que `createClientClaim` en
 * `client-portal.ts`), y solo `confirmPaymentDeclaration` — llamada desde el
 * CRM por un ADMIN/SUPERADMIN — crea el `Payment` real, reusando exactamente
 * la lógica de `POST /api/payments`.
 */

/** Compara importes en centavos: evita que el ruido de punto flotante deje pasar un centavo de más. */
function cents(amount: number): number {
  return Math.round(amount * 100);
}

function nombreDe(c: { firstName: string; lastName: string; company: string | null }): string {
  return c.company || `${c.firstName} ${c.lastName}`.trim();
}

const METODO_LABEL: Record<string, string> = {
  TRANSFER: "Transferencia",
  CASH: "Efectivo",
  CARD: "Tarjeta de crédito",
  CHECK: "Cheque",
  OTHER: "Otro",
};

type Resultado<T> = ({ ok: true } & T) | { ok: false; error: string; status: number };

export interface ClientPaymentDeclaration {
  id: string;
  saleId: string;
  saleNumber: number;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  status: PaymentDeclarationStatus;
  hasReceipt: boolean;
  rejectionReason: string | null;
  createdAt: string;
}

/** Las propias declaraciones de un Cliente, sin el comprobante (se pide aparte). */
export async function listClientDeclarations(contactId: string): Promise<ClientPaymentDeclaration[]> {
  const declaraciones = await prisma.paymentDeclaration.findMany({
    where: { contactId },
    select: {
      id: true,
      saleId: true,
      sale: { select: { number: true } },
      amount: true,
      method: true,
      reference: true,
      notes: true,
      status: true,
      receiptMimeType: true,
      rejectionReason: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return declaraciones.map((d) => ({
    id: d.id,
    saleId: d.saleId,
    saleNumber: d.sale.number,
    amount: Number(d.amount),
    method: d.method,
    reference: d.reference,
    notes: d.notes,
    status: d.status,
    hasReceipt: d.receiptMimeType !== null,
    rejectionReason: d.rejectionReason,
    createdAt: d.createdAt.toISOString(),
  }));
}

export interface CreateDeclarationInput {
  saleId: string;
  amount: number;
  method: string;
  reference?: string | null;
  notes?: string | null;
  receipt?: string | null;
  receiptMimeType?: string | null;
}

export async function createPaymentDeclaration(
  contactId: string,
  input: CreateDeclarationInput
): Promise<Resultado<{ declaration: ClientPaymentDeclaration }>> {
  const sale = await prisma.sale.findFirst({
    where: { id: input.saleId, contactId },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      contact: { select: { firstName: true, lastName: true, company: true } },
    },
  });
  if (!sale) return { ok: false, error: "Venta no encontrada", status: 404 };

  // Una venta anulada ya devolvió su stock: declarar un pago contra ella
  // dejaría plata imputada a algo que no existe (mismo chequeo que la app
  // móvil en /api/mobile/v1/payments).
  if (sale.status === "CANCELLED") {
    return { ok: false, error: `La venta #${sale.number} está anulada.`, status: 409 };
  }

  // Antes exigía un plan de cuotas vigente — pensado para "factura del día,
  // se cobra en el acto" (ver la nota larga en `credit.ts`), pero una venta
  // REGULAR sin plan también puede tardar en cobrarse (alguien que dice "te
  // transfiero más tarde"), y ahí no había ningún camino de autoservicio para
  // avisarlo. El chequeo de saldo de abajo ya es el que de verdad importa —no
  // deja declarar de más ni contra una venta saldada— y es agnóstico de si
  // hay plan o no, así que alcanza solo con él.
  const agg = await prisma.payment.aggregate({ where: { saleId: sale.id }, _sum: { amount: true } });
  const remaining = Number(sale.total) - Number(agg._sum.amount ?? 0);
  if (cents(input.amount) > cents(remaining)) {
    return {
      ok: false,
      error:
        remaining > 0
          ? `El saldo restante de la venta #${sale.number} es $${remaining.toLocaleString("es-AR")}. No podés declarar un pago mayor.`
          : `La venta #${sale.number} ya está saldada.`,
      status: 409,
    };
  }

  // Comprobante y su mimetype se guardan juntos o ninguno: unos bytes sin
  // saber su Content-Type no sirven para nada al servirlos después.
  const tieneComprobante = Boolean(input.receipt && input.receiptMimeType);

  const declaracion = await prisma.paymentDeclaration.create({
    data: {
      contactId,
      saleId: sale.id,
      amount: new Prisma.Decimal(input.amount),
      method: input.method,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
      receipt: tieneComprobante ? input.receipt : null,
      receiptMimeType: tieneComprobante ? input.receiptMimeType : null,
    },
  });

  // El mail tiene que alcanzar para decidir sin ir a buscar nada más: todos
  // los datos que tipeó el cliente en el formulario, en una sola línea (el
  // template de notifyAdmins escapa el mensaje y lo mete en un <p>, así que un
  // salto de línea no se ve — separamos con "·" como el resto del panel).
  const detalle = [
    `Monto: $${input.amount.toLocaleString("es-AR")}`,
    `Método: ${METODO_LABEL[input.method] ?? input.method}`,
    `Referencia: ${input.reference?.trim() || "sin referencia"}`,
    `Notas: ${input.notes?.trim() || "sin notas"}`,
    `Comprobante: ${tieneComprobante ? "sí" : "no"}`,
  ].join(" · ");

  await notifyAdmins({
    type: "PAYMENT_DECLARED",
    // Alguien de afuera declaró plata que alguien de la empresa tiene que
    // verificar antes de que cuente: igual criterio que un reclamo de garantía.
    email: true,
    title: "Nuevo pago declarado (portal de clientes)",
    message: `${nombreDe(sale.contact)} declaró un pago para la venta #${sale.number}. ${detalle}`,
    // Directo a la fila que hay que aprobar, no solo a la pantalla: ver el
    // punto 5 de payments/page.tsx (lee ?tab= y ?declarationId= y hace scroll).
    link: `/payments?tab=declarations&declarationId=${declaracion.id}`,
  });

  return {
    ok: true,
    declaration: {
      id: declaracion.id,
      saleId: sale.id,
      saleNumber: sale.number,
      amount: Number(declaracion.amount),
      method: declaracion.method,
      reference: declaracion.reference,
      notes: declaracion.notes,
      status: declaracion.status,
      hasReceipt: tieneComprobante,
      rejectionReason: null,
      createdAt: declaracion.createdAt.toISOString(),
    },
  };
}

/** Aviso al Cliente de que su declaración avanzó. Nunca tira: el estado ya quedó guardado. */
async function avisarAlCliente(contactId: string, title: string, message: string) {
  try {
    await prisma.portalNotification.create({
      data: { contactId, type: "PAYMENT_DECLARATION_UPDATED", title, message, link: "/cliente/cuenta" },
    });
  } catch (err) {
    log.error({ err, contactId }, "No se pudo avisar al cliente sobre su pago declarado");
  }
}

async function cargarDeclaracionPendiente(declarationId: string) {
  const declaracion = await prisma.paymentDeclaration.findUnique({
    where: { id: declarationId },
    include: {
      sale: { select: { id: true, number: true, status: true, total: true } },
      contact: { select: { firstName: true, lastName: true, company: true } },
    },
  });
  if (!declaracion) return { ok: false as const, error: "Declaración no encontrada", status: 404 };
  if (declaracion.status !== "PENDING") {
    return { ok: false as const, error: "Esta declaración ya fue revisada", status: 409 };
  }
  return { ok: true as const, declaracion };
}

/**
 * Confirma una declaración: crea el `Payment` real y lo imputa a las cuotas,
 * exactamente como `POST /api/payments` (`src/app/api/payments/route.ts`).
 */
export async function confirmPaymentDeclaration(
  declarationId: string,
  reviewerUserId: string
): Promise<Resultado<{ paymentId: string }>> {
  const cargado = await cargarDeclaracionPendiente(declarationId);
  if (!cargado.ok) return cargado;
  const { declaracion } = cargado;
  const { sale } = declaracion;

  if (sale.status === "CANCELLED") {
    return { ok: false, error: `La venta #${sale.number} está anulada.`, status: 409 };
  }

  // El saldo pudo cambiar desde que se declaró (otro pago, otra declaración
  // confirmada primero): se revalida antes de crear el Payment real.
  const agg = await prisma.payment.aggregate({ where: { saleId: sale.id }, _sum: { amount: true } });
  const remaining = Number(sale.total) - Number(agg._sum.amount ?? 0);
  const amount = Number(declaracion.amount);
  if (cents(amount) > cents(remaining)) {
    return {
      ok: false,
      error: `El saldo restante de la venta #${sale.number} ya no alcanza para este pago (quedan $${Math.max(remaining, 0).toLocaleString("es-AR")}).`,
      status: 409,
    };
  }

  const payment = await prisma.payment.create({
    data: {
      saleId: sale.id,
      contactId: declaracion.contactId,
      amount: declaracion.amount,
      method: declaracion.method,
      reference: declaracion.reference,
      notes: declaracion.notes,
    },
  });

  // Si la venta tiene plan de cuotas, imputa este pago. Sin plan no hace nada.
  await rebuildAllocations(sale.id);

  await prisma.paymentDeclaration.update({
    where: { id: declaracion.id },
    data: {
      status: "CONFIRMED",
      paymentId: payment.id,
      reviewedById: reviewerUserId,
      reviewedAt: new Date(),
    },
  });

  await logOperatorAction({
    userId: reviewerUserId,
    action: "CONFIRM_PAYMENT_DECLARATION",
    entityType: "PAYMENT_DECLARATION",
    entityId: declaracion.id,
    description: `Confirmó el pago declarado de $${amount.toLocaleString("es-AR")} de "${nombreDe(declaracion.contact)}" (venta #${sale.number})`,
    link: `/sales/${sale.id}`,
  });

  await avisarAlCliente(
    declaracion.contactId,
    "Confirmamos tu pago",
    `Confirmamos tu pago de $${amount.toLocaleString("es-AR")} para la compra #${sale.number}.`
  );

  return { ok: true, paymentId: payment.id };
}

export async function rejectPaymentDeclaration(
  declarationId: string,
  reviewerUserId: string,
  reason: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const cargado = await cargarDeclaracionPendiente(declarationId);
  if (!cargado.ok) return cargado;
  const { declaracion } = cargado;
  const { sale } = declaracion;

  await prisma.paymentDeclaration.update({
    where: { id: declaracion.id },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
      reviewedById: reviewerUserId,
      reviewedAt: new Date(),
    },
  });

  await logOperatorAction({
    userId: reviewerUserId,
    action: "REJECT_PAYMENT_DECLARATION",
    entityType: "PAYMENT_DECLARATION",
    entityId: declaracion.id,
    description: `Rechazó el pago declarado de "${nombreDe(declaracion.contact)}" (venta #${sale.number}): ${reason}`,
    link: `/sales/${sale.id}`,
  });

  await avisarAlCliente(
    declaracion.contactId,
    "Tu pago declarado no se pudo confirmar",
    `No pudimos confirmar el pago que declaraste para la compra #${sale.number}: ${reason}`
  );

  return { ok: true };
}
