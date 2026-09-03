import { prisma } from "@/lib/prisma";
import type { Prisma, WorkOrderStatus } from "@prisma/client";
import { createLogger } from "@/lib/logger";
import {
  generarGarantiasDeOrden,
  enviarMailDeGarantia,
  avisarGarantiasGeneradas,
  datosParaMail,
  type ResultadoGarantia,
} from "@/lib/workshop-warranty";

const log = createLogger("lib/workshop");

/**
 * Mi Taller — la lógica del módulo de taller del instalador.
 *
 * Plan completo en TALLER-INSTALADOR.md (raíz del workspace); el contrato de
 * la API, en CLIENT_PORTAL_API.md sección 4.10 en adelante.
 *
 * ─── La regla que sostiene todo ────────────────────────────────────────────
 *
 * **Un id que viene de la URL no autoriza nada.** Cada función de acá recibe el
 * `contactId` del instalador (sacado de la sesión firmada, nunca del body) y lo
 * mete en el `where`, incluso cuando además hay un id propio del recurso. Un
 * `findUnique({ where: { id } })` sobre una OT es exactamente el bug que deja
 * ver el taller del vecino cambiando un id en la URL.
 *
 * Para lo que cuelga indirectamente (vehículos, líneas, cobros) el filtro va
 * por la relación: `where: { id, workshopClient: { contactId } }`. Es el mismo
 * patrón que ya usa client-portal.ts para el stock, y tiene la ventaja de que
 * no se puede olvidar sin que el query deje de compilar.
 *
 * ─── Proyecciones explícitas ───────────────────────────────────────────────
 *
 * Todo `select`, nunca `include` pelado. Es la lección de F0-1, F0-2 y F0-12:
 * un include devuelve la fila entera y la fila entera termina en el HTML del
 * navegador. Acá todavía no hay secretos que filtrar, pero el hábito es la
 * defensa.
 */

// ─── Proyecciones ────────────────────────────────────────────────────────────

const CLIENT_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  dni: true,
  address: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkshopClientSelect;

const ASSET_SELECT = {
  id: true,
  workshopClientId: true,
  type: true,
  identifier: true,
  brand: true,
  model: true,
  year: true,
  color: true,
  notes: true,
  createdAt: true,
} satisfies Prisma.WorkshopAssetSelect;

/** Fila del listado de OT: lo justo para dibujar una lista, sin las líneas. */
const ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  scheduledAt: true,
  startedAt: true,
  finishedAt: true,
  deliveredAt: true,
  cancelledAt: true,
  priceQuoted: true,
  priceFinal: true,
  currency: true,
  createdAt: true,
  workshopClient: { select: { id: true, name: true, phone: true } },
  asset: { select: { id: true, type: true, identifier: true, brand: true, model: true } },
} satisfies Prisma.WorkOrderSelect;

/** Ficha completa de una OT: suma líneas, cobros y la garantía si ya se generó. */
const ORDER_DETAIL_SELECT = {
  ...ORDER_LIST_SELECT,
  notes: true,
  workshopClient: { select: CLIENT_SELECT },
  asset: { select: ASSET_SELECT },
  items: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      description: true,
      squareMetersUsed: true,
      price: true,
      product: { select: { id: true, name: true, sku: true } },
      roll: { select: { id: true, fullRollCode: true } },
    },
  },
  payments: {
    orderBy: { paidAt: "desc" as const },
    select: { id: true, amount: true, currency: true, method: true, reference: true, notes: true, paidAt: true },
  },
  // Solo el código y el estado: el activationToken NO sale de acá. Para
  // mandarle el link al cliente final está el flujo de garantías, que ya tiene
  // su propio endpoint y su propio control.
  warrantyInstallation: {
    select: { id: true, installationCode: true, status: true, expiresAt: true },
  },
} satisfies Prisma.WorkOrderSelect;

// ─── Clientes finales ────────────────────────────────────────────────────────

export async function listWorkshopClients(contactId: string, search?: string) {
  return prisma.workshopClient.findMany({
    where: {
      contactId,
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    },
    select: { ...CLIENT_SELECT, _count: { select: { assets: true, workOrders: true } } },
    orderBy: { name: "asc" },
    take: 200,
  });
}

export async function getWorkshopClient(contactId: string, clientId: string) {
  return prisma.workshopClient.findFirst({
    where: { id: clientId, contactId },
    select: {
      ...CLIENT_SELECT,
      assets: {
        orderBy: { createdAt: "desc" },
        // Con el conteo de OT por vehículo: la ficha del cliente es donde el
        // instalador mira "¿a este auto ya le hicimos algo?". Sin el _count la
        // pantalla mostraba 0 en todos, que es peor que no mostrar nada.
        select: { ...ASSET_SELECT, _count: { select: { workOrders: true } } },
      },
      _count: { select: { assets: true, workOrders: true } },
    },
  });
}

export interface WorkshopClientInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  dni?: string | null;
  address?: string | null;
  notes?: string | null;
}

export async function createWorkshopClient(contactId: string, data: WorkshopClientInput) {
  return prisma.workshopClient.create({
    data: { contactId, ...data },
    select: CLIENT_SELECT,
  });
}

export async function updateWorkshopClient(
  contactId: string,
  clientId: string,
  data: Partial<WorkshopClientInput>
) {
  // updateMany y no update: `update` exige un where único, y el único que
  // tenemos es el `id` — que por sí solo no prueba propiedad. Con updateMany se
  // puede filtrar por id Y contactId a la vez, y `count: 0` es la respuesta a
  // "no existe o no es tuyo", que desde afuera tienen que verse igual.
  const { count } = await prisma.workshopClient.updateMany({
    where: { id: clientId, contactId },
    data,
  });
  if (count === 0) return null;
  return getWorkshopClient(contactId, clientId);
}

/**
 * Borra un cliente final. Se niega si tiene OT: el historial de trabajos es el
 * activo del taller y no se tira por un click. El cascade de la base sí las
 * borraría — la regla vive acá a propósito.
 */
export async function deleteWorkshopClient(
  contactId: string,
  clientId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const client = await prisma.workshopClient.findFirst({
    where: { id: clientId, contactId },
    select: { id: true, _count: { select: { workOrders: true } } },
  });
  if (!client) return { ok: false, error: "Cliente no encontrado", status: 404 };
  if (client._count.workOrders > 0) {
    return {
      ok: false,
      error: "Este cliente tiene órdenes de trabajo y no se puede borrar",
      status: 409,
    };
  }
  await prisma.workshopClient.delete({ where: { id: client.id } });
  return { ok: true };
}

// ─── Vehículos / superficies ─────────────────────────────────────────────────

export async function listWorkshopAssets(contactId: string, clientId: string) {
  const client = await prisma.workshopClient.findFirst({
    where: { id: clientId, contactId },
    select: { id: true },
  });
  if (!client) return null;

  return prisma.workshopAsset.findMany({
    where: { workshopClientId: clientId },
    select: { ...ASSET_SELECT, _count: { select: { workOrders: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export interface WorkshopAssetInput {
  type?: "VEHICLE" | "WINDOW" | "BUILDING" | "OTHER";
  identifier?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  notes?: string | null;
}

export async function createWorkshopAsset(
  contactId: string,
  clientId: string,
  data: WorkshopAssetInput
) {
  const client = await prisma.workshopClient.findFirst({
    where: { id: clientId, contactId },
    select: { id: true },
  });
  if (!client) return null;

  return prisma.workshopAsset.create({
    data: { workshopClientId: clientId, ...data },
    select: ASSET_SELECT,
  });
}

// ─── Órdenes de trabajo ──────────────────────────────────────────────────────

export interface ListOrdersFilters {
  status?: WorkOrderStatus;
  from?: Date;
  to?: Date;
  clientId?: string;
}

export async function listWorkOrders(contactId: string, filters: ListOrdersFilters = {}) {
  const { status, from, to, clientId } = filters;
  return prisma.workOrder.findMany({
    where: {
      contactId,
      ...(status ? { status } : {}),
      ...(clientId ? { workshopClientId: clientId } : {}),
      // El rango filtra por turno (scheduledAt), que es lo que el instalador
      // tiene en la cabeza cuando pregunta "qué tengo esta semana". Las OT sin
      // turno quedan afuera de un rango a propósito.
      ...(from || to
        ? { scheduledAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    select: ORDER_LIST_SELECT,
    orderBy: [{ scheduledAt: "desc" }, { orderNumber: "desc" }],
    take: 300,
  });
}

export async function getWorkOrder(contactId: string, orderId: string) {
  return prisma.workOrder.findFirst({
    where: { id: orderId, contactId },
    select: ORDER_DETAIL_SELECT,
  });
}

export interface WorkOrderItemInput {
  description: string;
  productId?: string | null;
  rollId?: string | null;
  squareMetersUsed?: number | null;
  price?: number | null;
}

export interface CreateWorkOrderInput {
  workshopClientId: string;
  assetId?: string | null;
  scheduledAt?: Date | null;
  priceQuoted?: number | null;
  currency?: "ARS" | "USD";
  notes?: string | null;
  items?: WorkOrderItemInput[];
}

type Fail = { ok: false; error: string; status: number };

/**
 * Verifica que todo lo que la OT referencia sea de este instalador.
 *
 * Es la función que impide que alguien arme una OT propia colgando de un rollo
 * ajeno o del vehículo de un cliente de otro taller. Los tres errores devuelven
 * 404 y no 403: confirmar "existe pero no es tuyo" ya es filtrar información.
 */
async function validateOrderRefs(
  contactId: string,
  input: { workshopClientId?: string; assetId?: string | null; items?: WorkOrderItemInput[] }
): Promise<Fail | null> {
  if (input.workshopClientId) {
    const client = await prisma.workshopClient.findFirst({
      where: { id: input.workshopClientId, contactId },
      select: { id: true },
    });
    if (!client) return { ok: false, error: "Cliente no encontrado", status: 404 };
  }

  if (input.assetId) {
    // El vehículo tiene que ser del MISMO cliente final de la OT, no solo de
    // este taller: si no, se podría armar una OT del cliente A con el auto de B.
    const asset = await prisma.workshopAsset.findFirst({
      where: {
        id: input.assetId,
        workshopClient: {
          contactId,
          ...(input.workshopClientId ? { id: input.workshopClientId } : {}),
        },
      },
      select: { id: true },
    });
    if (!asset) return { ok: false, error: "Vehículo no encontrado", status: 404 };
  }

  const rollIds = [...new Set((input.items ?? []).map((i) => i.rollId).filter((r): r is string => !!r))];
  if (rollIds.length > 0) {
    // Rollo propio = vendido a este contacto. Es el mismo criterio de
    // pertenencia que usa getClientStock().
    const propios = await prisma.warrantyRoll.findMany({
      where: { id: { in: rollIds }, saleItem: { sale: { contactId } } },
      select: { id: true, productId: true },
    });
    if (propios.length !== rollIds.length) {
      return { ok: false, error: "Rollo no encontrado", status: 404 };
    }
    // Si la línea declara rollo Y producto, tienen que ser el mismo producto:
    // de lo contrario el consumo se le descuenta a un rollo de otra lámina.
    const productoDeRollo = new Map(propios.map((r) => [r.id, r.productId]));
    for (const item of input.items ?? []) {
      if (item.rollId && item.productId && productoDeRollo.get(item.rollId) !== item.productId) {
        return {
          ok: false,
          error: "El producto de la línea no coincide con el del rollo",
          status: 400,
        };
      }
    }
  }

  return null;
}

export async function createWorkOrder(
  contactId: string,
  input: CreateWorkOrderInput
): Promise<{ ok: true; order: NonNullable<Awaited<ReturnType<typeof getWorkOrder>>> } | Fail> {
  const invalid = await validateOrderRefs(contactId, input);
  if (invalid) return invalid;

  const { workshopClientId, assetId, scheduledAt, priceQuoted, currency, notes, items } = input;

  const created = await prisma.$transaction(async (tx) => {
    // Contador por instalador. El increment es atómico y toma el lock de la
    // fila, así que dos altas simultáneas se serializan en vez de pisarse; un
    // `max(orderNumber) + 1` no daría esa garantía.
    await tx.workshopSettings.upsert({
      where: { contactId },
      create: { contactId },
      update: {},
    });
    const settings = await tx.workshopSettings.update({
      where: { contactId },
      data: { nextOrderNumber: { increment: 1 } },
      select: { nextOrderNumber: true },
    });

    return tx.workOrder.create({
      data: {
        contactId,
        // `update` devuelve el valor YA incrementado; a esta OT le toca el anterior.
        orderNumber: settings.nextOrderNumber - 1,
        workshopClientId,
        assetId: assetId ?? null,
        scheduledAt: scheduledAt ?? null,
        // Si viene turno, la OT nace agendada: cargar un turno y dejarla en
        // "presupuestada" es un estado que no significa nada.
        status: scheduledAt ? "AGENDADA" : "PRESUPUESTADA",
        priceQuoted: priceQuoted ?? null,
        currency: currency ?? "ARS",
        notes: notes ?? null,
        ...(items && items.length > 0
          ? {
              items: {
                create: items.map((i) => ({
                  description: i.description,
                  productId: i.productId ?? null,
                  rollId: i.rollId ?? null,
                  squareMetersUsed: i.squareMetersUsed ?? null,
                  price: i.price ?? null,
                })),
              },
            }
          : {}),
      },
      select: { id: true },
    });
  });

  const order = await getWorkOrder(contactId, created.id);
  if (!order) return { ok: false, error: "Error al crear la orden", status: 500 };
  return { ok: true, order };
}

export interface UpdateWorkOrderInput {
  workshopClientId?: string;
  assetId?: string | null;
  scheduledAt?: Date | null;
  priceQuoted?: number | null;
  priceFinal?: number | null;
  currency?: "ARS" | "USD";
  notes?: string | null;
  /** Si viene, REEMPLAZA todas las líneas. Ver la nota de abajo. */
  items?: WorkOrderItemInput[];
}

/**
 * Edita la ficha de una OT. **No cambia el estado**: para eso está
 * `transitionWorkOrder`, porque entrar en TERMINADA dispara efectos.
 *
 * Las líneas se reemplazan enteras cuando vienen (borrar todas + crear las
 * nuevas), no se hace merge por id. Es lo que espera una pantalla donde el
 * instalador agrega y saca renglones antes de guardar, y evita todo el
 * problema de "esta línea que me mandás, ¿es de esta OT?".
 */
export async function updateWorkOrder(
  contactId: string,
  orderId: string,
  input: UpdateWorkOrderInput
): Promise<{ ok: true; order: NonNullable<Awaited<ReturnType<typeof getWorkOrder>>> } | Fail> {
  const existing = await prisma.workOrder.findFirst({
    where: { id: orderId, contactId },
    select: { id: true, status: true, workshopClientId: true },
  });
  if (!existing) return { ok: false, error: "Orden no encontrada", status: 404 };
  if (existing.status === "ENTREGADA" || existing.status === "CANCELADA") {
    return { ok: false, error: "Esta orden ya está cerrada", status: 409 };
  }

  const invalid = await validateOrderRefs(contactId, {
    workshopClientId: input.workshopClientId,
    // Si se cambia el cliente y no el vehículo, el vehículo viejo puede quedar
    // colgando de otro cliente: se valida contra el cliente que va a quedar.
    assetId: input.assetId,
    items: input.items,
  });
  if (invalid) return invalid;

  const { items, ...fields } = input;

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id: existing.id },
      data: {
        ...(fields.workshopClientId !== undefined ? { workshopClientId: fields.workshopClientId } : {}),
        ...(fields.assetId !== undefined ? { assetId: fields.assetId } : {}),
        ...(fields.scheduledAt !== undefined ? { scheduledAt: fields.scheduledAt } : {}),
        ...(fields.priceQuoted !== undefined ? { priceQuoted: fields.priceQuoted } : {}),
        ...(fields.priceFinal !== undefined ? { priceFinal: fields.priceFinal } : {}),
        ...(fields.currency !== undefined ? { currency: fields.currency } : {}),
        ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
      },
    });

    if (items) {
      await tx.workOrderItem.deleteMany({ where: { workOrderId: existing.id } });
      if (items.length > 0) {
        await tx.workOrderItem.createMany({
          data: items.map((i) => ({
            workOrderId: existing.id,
            description: i.description,
            productId: i.productId ?? null,
            rollId: i.rollId ?? null,
            squareMetersUsed: i.squareMetersUsed ?? null,
            price: i.price ?? null,
          })),
        });
      }
    }
  });

  const order = await getWorkOrder(contactId, existing.id);
  if (!order) return { ok: false, error: "Error al actualizar la orden", status: 500 };
  return { ok: true, order };
}

// ─── Máquina de estados ──────────────────────────────────────────────────────

/**
 * Transiciones permitidas.
 *
 * La regla en una línea: **antes de TERMINADA se puede ir y venir libremente;
 * después, es de una sola dirección.**
 *
 * Ir y venir entre PRESUPUESTADA / AGENDADA / EN_PROCESO no rompe nada porque
 * ninguno de esos estados tiene efectos: sirve para deshacer un botón mal
 * apretado, que es algo que pasa todo el tiempo en un teléfono al lado de un
 * auto. Y se puede saltear hacia adelante, porque el que entra sin turno va
 * directo a EN_PROCESO.
 *
 * TERMINADA es la línea que no se cruza para atrás: ahí se descuenta material y
 * se genera la garantía (Fase 4). Deshacer eso no es "volver al estado
 * anterior", es una reversión —devolver m² al rollo, anular una instalación que
 * quizás el cliente final ya activó— y eso necesita su propia operación
 * pensada, no una flecha más en esta tabla.
 *
 * Por lo mismo CANCELADA no sale de TERMINADA: cancelar es "esto no pasó", y
 * una vez terminada, pasó.
 */
const TRANSICIONES: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  PRESUPUESTADA: ["AGENDADA", "EN_PROCESO", "TERMINADA", "CANCELADA"],
  AGENDADA: ["PRESUPUESTADA", "EN_PROCESO", "TERMINADA", "CANCELADA"],
  EN_PROCESO: ["PRESUPUESTADA", "AGENDADA", "TERMINADA", "CANCELADA"],
  TERMINADA: ["ENTREGADA"],
  ENTREGADA: [],
  CANCELADA: [],
};

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return TRANSICIONES[from].includes(to);
}

/** Lo que la transición reporta además de la orden actualizada. */
export interface EfectosDeTerminar {
  /** Códigos de las garantías que se activaron, la principal primera. */
  garantias: { installationCode: string; fullRollCode: string; expiresAt: string }[];
  /** Rollos que no pudieron generar garantía, con el motivo en castellano. */
  problemas: { fullRollCode: string; motivo: string }[];
  /** Si se le mandó el mail al cliente final, y si no, por qué. */
  mail: { enviado: boolean; motivo?: string };
}

export async function transitionWorkOrder(
  contactId: string,
  orderId: string,
  to: WorkOrderStatus,
  extra: { priceFinal?: number | null } = {}
): Promise<
  | {
      ok: true;
      order: NonNullable<Awaited<ReturnType<typeof getWorkOrder>>>;
      efectos?: EfectosDeTerminar;
    }
  | Fail
> {
  const order = await prisma.workOrder.findFirst({
    where: { id: orderId, contactId },
    select: {
      id: true,
      status: true,
      assetId: true,
      startedAt: true,
      finishedAt: true,
      deliveredAt: true,
      cancelledAt: true,
    },
  });
  if (!order) return { ok: false, error: "Orden no encontrada", status: 404 };

  if (order.status === to) {
    return { ok: false, error: `La orden ya está en ${to}`, status: 409 };
  }
  if (!canTransition(order.status, to)) {
    return {
      ok: false,
      error: `No se puede pasar de ${order.status} a ${to}`,
      status: 409,
    };
  }

  // Terminar exige el vehículo cargado: la garantía que se va a generar en la
  // Fase 4 necesita assetType y assetDescription, y no hay de dónde sacarlos si
  // la OT nunca supo sobre qué se trabajó.
  if (to === "TERMINADA" && !order.assetId) {
    return {
      ok: false,
      error: "Cargá el vehículo antes de terminar la orden",
      status: 400,
    };
  }

  const now = new Date();
  // Los timestamps se sellan la PRIMERA vez que se entra a cada estado y no se
  // pisan después: son el registro de cuándo pasó cada cosa, no un espejo del
  // estado actual. Si alguien vuelve atrás y avanza de nuevo, startedAt sigue
  // marcando cuándo se empezó de verdad.
  const sello: Prisma.WorkOrderUpdateInput = { status: to };
  if (to === "EN_PROCESO" && !order.startedAt) sello.startedAt = now;
  if (to === "TERMINADA" && !order.finishedAt) sello.finishedAt = now;
  if (to === "ENTREGADA" && !order.deliveredAt) sello.deliveredAt = now;
  if (to === "CANCELADA" && !order.cancelledAt) sello.cancelledAt = now;
  if (extra.priceFinal !== undefined && extra.priceFinal !== null) {
    sello.priceFinal = extra.priceFinal;
  }

  // Terminar es la única transición con efectos. El cambio de estado y la
  // generación de las garantías van juntos en una transacción: que quede una
  // orden terminada sin su garantía —o al revés— sería peor que fallar entera.
  //
  // El mail NO va acá adentro. Va después del commit, porque mandar un mail
  // dentro de una transacción de base la mantiene abierta contra un servidor
  // SMTP que puede tardar segundos, y porque su fallo no tiene que revertir
  // nada: el trabajo ya se hizo.
  let garantias: ResultadoGarantia = { generadas: [], problemas: [] };

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({ where: { id: order.id }, data: sello });
    if (to === "TERMINADA") {
      garantias = await generarGarantiasDeOrden(tx, order.id);
    }
  });

  const updated = await getWorkOrder(contactId, order.id);
  if (!updated) return { ok: false, error: "Error al cambiar el estado", status: 500 };
  if (to !== "TERMINADA") return { ok: true, order: updated };

  // ── Todo lo que sigue es después del commit y no puede tumbar la respuesta ──
  let mail: { enviado: boolean; motivo?: string } = {
    enviado: false,
    motivo: "No se generó ninguna garantía",
  };

  if (garantias.generadas.length > 0) {
    const principal = garantias.generadas[0];
    // El mail sale una sola vez aunque el trabajo haya usado dos rollos: al
    // cliente final le importa su auto, no de cuántos rollos salió la lámina.
    // Los códigos de los demás quedan en la orden y en el listado del taller.
    if (await autoEnviaMail(contactId)) {
      const datos = await datosParaMail(order.id, principal.installationId);
      mail = datos
        ? await enviarMailDeGarantia(datos)
        : { enviado: false, motivo: "No pudimos armar el mail" };
    } else {
      mail = { enviado: false, motivo: "El envío automático está desactivado en tu configuración" };
    }
  }

  // Avisar a los admins no puede romper la respuesta: si falla, se loguea.
  await avisarGarantiasGeneradas(garantias, updated.orderNumber).catch((err) =>
    log.error({ err, orderId: order.id }, "Failed to notify admins about workshop warranties")
  );

  return {
    ok: true,
    order: updated,
    efectos: {
      garantias: garantias.generadas.map((g) => ({
        installationCode: g.installationCode,
        fullRollCode: g.fullRollCode,
        expiresAt: g.expiresAt.toISOString(),
      })),
      problemas: garantias.problemas,
      mail,
    },
  };
}

/** ¿Este taller quiere que el mail de garantía salga solo? Default: sí. */
async function autoEnviaMail(contactId: string): Promise<boolean> {
  const settings = await prisma.workshopSettings.findUnique({
    where: { contactId },
    select: { autoSendWarrantyEmail: true },
  });
  return settings?.autoSendWarrantyEmail ?? true;
}

// ─── Cobros ──────────────────────────────────────────────────────────────────

export interface WorkOrderPaymentInput {
  amount: number;
  currency?: "ARS" | "USD";
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  paidAt?: Date;
}

/**
 * Registra un cobro del cliente final al instalador.
 *
 * **No toca la cuenta corriente del CRM.** El saldo que Kristall le lleva al
 * instalador sale de Sale/Payment/AccountAdjustment (src/lib/account.ts) y esto
 * no entra ahí: es plata entre el instalador y su cliente, en la que Kristall
 * no es parte.
 */
export async function addWorkOrderPayment(
  contactId: string,
  orderId: string,
  input: WorkOrderPaymentInput
): Promise<{ ok: true; payment: { id: string } } | Fail> {
  const order = await prisma.workOrder.findFirst({
    where: { id: orderId, contactId },
    select: { id: true, status: true, currency: true },
  });
  if (!order) return { ok: false, error: "Orden no encontrada", status: 404 };
  if (order.status === "CANCELADA") {
    return { ok: false, error: "Esta orden está cancelada", status: 409 };
  }

  const payment = await prisma.workOrderPayment.create({
    data: {
      workOrderId: order.id,
      amount: input.amount,
      currency: input.currency ?? order.currency,
      method: input.method ?? null,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      ...(input.paidAt ? { paidAt: input.paidAt } : {}),
    },
    select: { id: true, amount: true, currency: true, method: true, paidAt: true },
  });
  return { ok: true, payment };
}

// ─── Agenda ──────────────────────────────────────────────────────────────────

/**
 * Las OT con turno dentro de un rango. Deja afuera las canceladas: un turno
 * cancelado libera la franja, que es justamente el punto de cancelarlo.
 */
export async function getAgenda(contactId: string, from: Date, to: Date) {
  return prisma.workOrder.findMany({
    where: {
      contactId,
      status: { not: "CANCELADA" },
      scheduledAt: { gte: from, lte: to },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      scheduledAt: true,
      workshopClient: { select: { id: true, name: true, phone: true } },
      asset: { select: { type: true, identifier: true, brand: true, model: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });
}

// ─── Stock con m² restantes ──────────────────────────────────────────────────

/**
 * El stock del instalador, con cuánto queda adentro de cada rollo.
 *
 * El sobrante se DERIVA, no se guarda: `width × length − Σ(squareMetersUsed)`
 * de las líneas que declararon ese rollo. Es una consulta agrupada aparte en
 * vez de un campo denormalizado, para que no haya dos números que puedan
 * discrepar. Si algún día se pone lento, ahí se denormaliza — con la evidencia
 * a la vista.
 *
 * ─── Consumido y reservado son dos números distintos ───────────────────────
 *
 * Desde la Fase 4, "terminar una orden" es lo que consume material de verdad.
 * Pero una orden agendada con las líneas ya cargadas también tiene ese material
 * comprometido, y contarlo como disponible haría que el instalador venda dos
 * veces el mismo pedazo de rollo.
 *
 * Por eso hay dos cuentas y no una:
 *
 *   `usedM2`      — lo que ya se cortó (órdenes TERMINADA o ENTREGADA).
 *   `reservedM2`  — lo comprometido y todavía sin cortar (PRESUPUESTADA,
 *                   AGENDADA, EN_PROCESO). Las canceladas no cuentan en ninguna.
 *   `remainingM2` — lo que físicamente queda en el rollo: total − usado.
 *   `availableM2` — con lo que puede contar para un trabajo nuevo:
 *                   total − usado − reservado.
 *
 * El plan decía "TERMINADA descuenta m²" y eso ahora es literalmente cierto;
 * lo que faltaba era decir qué pasa con lo prometido pero no cortado.
 *
 * Los cuatro son `null` cuando el producto no tiene `width` y `length`
 * cargados. Es `null` y no `0` a propósito: "no sé cuánto queda" y "no queda
 * nada" son cosas distintas, y mostrar 0 haría creer que el rollo está vacío.
 *
 * NO devuelve `currentLocation` — misma razón que en PORTAL_ROLL_SELECT
 * (ver F0-24): puede ser el Punto de Reventa de otro instalador.
 */
export async function getWorkshopStock(contactId: string) {
  const rolls = await prisma.warrantyRoll.findMany({
    where: { saleItem: { sale: { contactId } } },
    select: {
      id: true,
      fullRollCode: true,
      status: true,
      lot: { select: { lotNumber: true } },
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          category: true,
          width: true,
          length: true,
          // `installWarrantyMonths` es la garantia que le queda al CLIENTE FINAL
          // —no `rollWarrantyMonths`, que cubre el rollo sin instalar—, y es la
          // que el instalador necesita poder decirle en el mostrador.
          // `warrantyEnabled` viaja con ella porque un producto puede tener
          // config y tenerla apagada: sin ese dato no se distingue de uno que
          // si cubre.
          warrantyConfig: {
            select: {
              maxInstallations: true,
              installWarrantyMonths: true,
              warrantyEnabled: true,
            },
          },
        },
      },
      installations: {
        orderBy: { installationNumber: "asc" },
        select: {
          id: true,
          installationCode: true,
          status: true,
          activatedAt: true,
          expiresAt: true,
      // Precargados por el taller. No son PII del cliente final —el mail, el
      // nombre y el telefono siguen sin salir por aca—: identifican el trabajo,
      // y el instalador necesita reconocer cual instalacion es cual.
      vehicleType: true,
      plate: true,
        },
      },
      _count: { select: { installations: { where: { status: "ACTIVE" } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (rolls.length === 0) return [];

  const ids = rolls.map((r) => r.id);
  const [consumido, reservado] = await Promise.all([
    prisma.workOrderItem.groupBy({
      by: ["rollId"],
      where: {
        rollId: { in: ids },
        workOrder: { status: { in: ["TERMINADA", "ENTREGADA"] } },
      },
      _sum: { squareMetersUsed: true },
    }),
    prisma.workOrderItem.groupBy({
      by: ["rollId"],
      where: {
        rollId: { in: ids },
        workOrder: { status: { in: ["PRESUPUESTADA", "AGENDADA", "EN_PROCESO"] } },
      },
      _sum: { squareMetersUsed: true },
    }),
  ]);

  const suma = (filas: typeof consumido) =>
    new Map(filas.map((c) => [c.rollId, Number(c._sum.squareMetersUsed ?? 0)]));
  const usadoPorRollo = suma(consumido);
  const reservadoPorRollo = suma(reservado);
  const redondear = (n: number) => Math.round(n * 100) / 100;

  return rolls.map((roll) => {
    const { width, length } = roll.product;
    const totalM2 = width != null && length != null ? Number(width) * Number(length) : null;
    const usedM2 = redondear(usadoPorRollo.get(roll.id) ?? 0);
    const reservedM2 = redondear(reservadoPorRollo.get(roll.id) ?? 0);
    return {
      ...roll,
      totalM2,
      usedM2,
      reservedM2,
      remainingM2: totalM2 == null ? null : redondear(totalM2 - usedM2),
      availableM2: totalM2 == null ? null : redondear(totalM2 - usedM2 - reservedM2),
    };
  });
}

// ─── Resumen para el dashboard ───────────────────────────────────────────────

/**
 * Los números de la pantalla "Hoy". Un solo endpoint en vez de que el panel
 * pida seis cosas: es la primera pantalla que abre el instalador a la mañana,
 * muchas veces con mala señal.
 *
 * `desde`/`hasta` acotan lo que se mide del mes (facturado, cobrado, m²); los
 * contadores por estado y los de hoy son siempre del momento.
 */
export async function getWorkshopSummary(contactId: string, desde: Date, hasta: Date) {
  const inicioDeHoy = new Date();
  inicioDeHoy.setHours(0, 0, 0, 0);
  const finDeHoy = new Date(inicioDeHoy);
  finDeHoy.setDate(finDeHoy.getDate() + 1);

  const [porEstado, turnosDeHoy, enProceso, delPeriodo, cobrado, consumo] = await Promise.all([
    prisma.workOrder.groupBy({ by: ["status"], where: { contactId }, _count: { _all: true } }),
    prisma.workOrder.count({
      where: {
        contactId,
        status: { not: "CANCELADA" },
        scheduledAt: { gte: inicioDeHoy, lt: finDeHoy },
      },
    }),
    prisma.workOrder.count({ where: { contactId, status: "EN_PROCESO" } }),
    prisma.workOrder.aggregate({
      where: { contactId, status: { in: ["TERMINADA", "ENTREGADA"] }, finishedAt: { gte: desde, lte: hasta } },
      _count: { _all: true },
      _sum: { priceFinal: true },
    }),
    // Los cobros **de las órdenes que se cuentan en `facturado`**, no todos los
    // cobros con fecha en el período. Es una diferencia que se ve enseguida en
    // pantalla: una seña sobre un trabajo que todavía no terminó entraba en
    // `cobrado` sin que su orden entrara en `facturado`, y `porCobrar` daba
    // NEGATIVO. Un "por cobrar" negativo no significa nada para nadie.
    //
    // Para que la resta tenga sentido, los dos números tienen que ser sobre el
    // mismo conjunto de órdenes. Lo que se pierde es "cuánta plata entró este
    // mes", que es otra métrica y merece su propio campo el día que se pida.
    prisma.workOrderPayment.aggregate({
      where: {
        workOrder: {
          contactId,
          status: { in: ["TERMINADA", "ENTREGADA"] },
          finishedAt: { gte: desde, lte: hasta },
        },
      },
      _sum: { amount: true },
    }),
    prisma.workOrderItem.aggregate({
      where: {
        workOrder: {
          contactId,
          status: { in: ["TERMINADA", "ENTREGADA"] },
          finishedAt: { gte: desde, lte: hasta },
        },
      },
      _sum: { squareMetersUsed: true },
    }),
  ]);

  const conteos = Object.fromEntries(porEstado.map((g) => [g.status, g._count._all]));
  const facturado = Number(delPeriodo._sum.priceFinal ?? 0);
  const recaudado = Number(cobrado._sum.amount ?? 0);

  return {
    hoy: { turnos: turnosDeHoy, enProceso },
    ordenes: {
      PRESUPUESTADA: conteos.PRESUPUESTADA ?? 0,
      AGENDADA: conteos.AGENDADA ?? 0,
      EN_PROCESO: conteos.EN_PROCESO ?? 0,
      TERMINADA: conteos.TERMINADA ?? 0,
      ENTREGADA: conteos.ENTREGADA ?? 0,
      CANCELADA: conteos.CANCELADA ?? 0,
    },
    periodo: {
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
      terminadas: delPeriodo._count._all,
      facturado,
      // Cobrado CONTRA los trabajos terminados en el período — incluidas las
      // señas que se hayan tomado antes de terminarlos.
      cobrado: recaudado,
      // De lo que hiciste este mes, cuánto falta cobrar. No es la deuda
      // histórica del taller: para eso habría que sumar desde el principio.
      porCobrar: Math.round((facturado - recaudado) * 100) / 100,
      metrosCuadrados: Number(consumo._sum.squareMetersUsed ?? 0),
    },
  };
}

// ─── Servicios y página pública ──────────────────────────────────────────────
//
// El catálogo de servicios y el handle son lo que hace posible la página del
// taller en polariz.ar. Viven acá y no en un archivo aparte porque comparten el
// filtro por `contactId` con todo lo demás de Mi Taller: el dueño del dato es
// siempre el instalador logueado, nunca un id que venga del request.

/** Los servicios del taller. Incluye los inactivos: el dueño los tiene que ver. */
export async function getWorkshopServices(contactId: string) {
  return prisma.workshopService.findMany({
    where: { contactId },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      priceFrom: true,
      currency: true,
      durationMinutes: true,
      active: true,
      sortOrder: true,
    },
  });
}

/**
 * Un servicio nuevo va al final de la lista.
 *
 * `sortOrder` se calcula acá y no se pide a la pantalla: si lo mandara el
 * cliente, dos altas simultáneas se pisarían el mismo número.
 */
export async function createWorkshopService(
  contactId: string,
  datos: {
    name: string;
    description?: string | null;
    priceFrom?: number | null;
    currency?: "ARS" | "USD";
    durationMinutes?: number;
  }
) {
  const ultimo = await prisma.workshopService.findFirst({
    where: { contactId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return prisma.workshopService.create({
    data: {
      contactId,
      name: datos.name,
      description: datos.description ?? null,
      priceFrom: datos.priceFrom ?? null,
      currency: datos.currency ?? "ARS",
      durationMinutes: datos.durationMinutes ?? 60,
      sortOrder: (ultimo?.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  });
}

/**
 * Editar y desactivar.
 *
 * El `updateMany` con el `contactId` en el where es la barrera de propiedad: un
 * id de otro taller no da error, da 0 filas afectadas, y el endpoint lo traduce
 * a 404. Nunca confirma que ese id exista.
 */
export async function updateWorkshopService(
  contactId: string,
  serviceId: string,
  datos: Record<string, unknown>
): Promise<boolean> {
  const r = await prisma.workshopService.updateMany({
    where: { id: serviceId, contactId },
    data: datos,
  });
  return r.count > 0;
}

/**
 * No borra: desactiva.
 *
 * Un servicio borrado se llevaría puesto el pedido de turno que lo originó, y
 * el instalador perdería el registro de qué le pidieron.
 */
export async function deactivateWorkshopService(contactId: string, serviceId: string) {
  return updateWorkshopService(contactId, serviceId, { active: false });
}

/**
 * De una lista de candidatos, cuáles están libres.
 *
 * Una sola consulta para todos: preguntar de a uno sería una consulta por cada
 * taller que ya tomó ese nombre, justo en la pantalla donde el instalador está
 * esperando la sugerencia.
 *
 * `excluirContactId` es para que el handle propio no se le reporte como
 * ocupado a su dueño cuando vuelve a entrar a la configuración.
 */
export async function handlesLibres(
  candidatos: string[],
  excluirContactId?: string
): Promise<string[]> {
  if (candidatos.length === 0) return [];
  const tomados = await prisma.workshopSettings.findMany({
    where: {
      handle: { in: candidatos },
      ...(excluirContactId ? { contactId: { not: excluirContactId } } : {}),
    },
    select: { handle: true },
  });
  const ocupados = new Set(tomados.map((t) => t.handle));
  return candidatos.filter((c) => !ocupados.has(c));
}
