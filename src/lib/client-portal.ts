import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { notifyAdmins } from "@/lib/notifications";
import { getClientBalance } from "@/lib/account";

/** Contacts of type CLIENT are the only ones exposed to the portal API. */
export async function findClientContact(contactId: string) {
  return prisma.contact.findFirst({
    where: { id: contactId, type: "CLIENT" },
    select: { id: true, firstName: true, lastName: true, company: true, email: true },
  });
}

/** Resolves a CLIENT contact by email. Used for the external backend's initial linking step. */
export async function lookupClientByEmail(email: string) {
  return prisma.contact.findMany({
    where: { type: "CLIENT", email },
    select: { id: true, firstName: true, lastName: true, company: true },
  });
}

/**
 * Profile + purchases + payments + outstanding balance for a CLIENT contact.
 * Same calculation used internally by src/app/api/clients/[id]/route.ts,
 * extracted here so both the internal route and the portal API share it.
 */
export async function getClientProfile(contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, type: "CLIENT" },
    include: {
      sales: {
        include: {
          items: { include: { product: { select: { id: true, name: true } } } },
          payments: true,
        },
        orderBy: { createdAt: "desc" },
      },
      payments: {
        include: { sale: { select: { number: true } } },
        orderBy: { paidAt: "desc" },
      },
    },
  });
  if (!contact) return null;

  // El saldo NO se acumula acá. Sumar total−pagado sobre `contact.sales` daba
  // un número distinto al de la cuenta corriente (sección 4.9): contaba las
  // ventas CANCELLED, cuya deuda está revertida, y no aplicaba los
  // AccountAdjustment (notas de crédito). El Cliente veía un saldo en el
  // Dashboard y otro en Cuenta corriente. getClientBalance() es el cálculo
  // canónico — un solo lugar, para las dos pantallas y para el CRM interno.
  const balance = await getClientBalance(contactId);

  const purchases = contact.sales.map((sale) => {
    const paidAmount = sale.payments.reduce((s, p) => s + Number(p.amount), 0);
    const saleTotal = Number(sale.total);

    let paymentStatus = "PENDING";
    if (paidAmount >= saleTotal) paymentStatus = "PAID";
    else if (paidAmount > 0) paymentStatus = "PARTIAL";

    return {
      id: sale.id,
      saleNumber: `#${sale.number}`,
      total: saleTotal,
      paymentStatus,
      createdAt: sale.createdAt.toISOString(),
      items: sale.items.map((item) => ({
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
    };
  });

  const payments = contact.payments.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    method: p.method || "OTHER",
    date: p.paidAt.toISOString(),
    saleNumber: p.sale ? `#${p.sale.number}` : "—",
  }));

  return {
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    name: `${contact.firstName} ${contact.lastName}`,
    company: contact.company,
    email: contact.email,
    phone: contact.phone,
    address: contact.address,
    city: contact.city,
    state: contact.state,
    purchases,
    payments,
    balance,
  };
}

/**
 * Projection for the rolls the portal returns (CLIENT_PORTAL_API.md 4.2).
 * Deliberately NOT ROLL_TRACE_INCLUDE: that one is internal CRM traceability
 * (whole lot row, the CRM operator who made the sale, and installations with
 * activationToken + the end customer's PII). Everything listed here is meant
 * to leave the CRM — nothing else does. Keep it in sync with the doc and with
 * the StockRoll type in kristall-web (lib/client-portal/api.ts).
 */
const PORTAL_ROLL_SELECT = {
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
      warrantyConfig: { select: { maxInstallations: true } },
    },
  },
  // Sin `currentLocation`: es custodia física interna. Como el FIFO de
  // linkRollToSaleItem no filtra por ubicación, a este Cliente se le puede
  // haber asignado un rollo que estaba consignado en el Punto de Reventa de
  // OTRO instalador — y `currentLocationId` no se limpia al vender. Devolverlo
  // le mostraba el nombre y el contactId del taller de un competidor.
  //
  // Sin activationToken ni PII del usuario final: son datos del dueño del auto,
  // no del Cliente que compró el rollo.
  installations: {
    orderBy: { installationNumber: "asc" as const },
    select: {
      id: true,
      installationCode: true,
      status: true,
      activatedAt: true,
      expiresAt: true,
    },
  },
  _count: {
    select: { installations: { where: { status: "ACTIVE" as const } } },
  },
} satisfies Prisma.WarrantyRollSelect;

/** Warranty rolls owned by a CLIENT contact (sold to them via a completed Sale). */
export async function getClientStock(contactId: string) {
  return prisma.warrantyRoll.findMany({
    where: { saleItem: { sale: { contactId } } },
    select: PORTAL_ROLL_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Warranty installations that live on rolls owned by this CLIENT contact.
 * Explicit select (CLIENT_PORTAL_API.md 4.3): a bare `include` would ship the
 * whole row — portalPasswordHash, activationToken, clientDni/Email/Phone,
 * installerName, notes — straight into the portal's HTML.
 */
export async function getClientInstallations(contactId: string) {
  return prisma.warrantyInstallation.findMany({
    where: { roll: { saleItem: { sale: { contactId } } } },
    select: {
      id: true,
      installationCode: true,
      status: true,
      assetType: true,
      assetDescription: true,
      activatedAt: true,
      expiresAt: true,
      roll: {
        select: {
          fullRollCode: true,
          product: { select: { id: true, name: true, sku: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Warranty claims filed on installations that belong to this CLIENT contact. */
export async function getClientClaims(contactId: string) {
  return prisma.warrantyClaim.findMany({
    where: { installation: { roll: { saleItem: { sale: { contactId } } } } },
    include: {
      installation: {
        select: { installationCode: true, status: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Files a new claim on behalf of a CLIENT contact. Ownership is proven
 * structurally (the installation's roll must have been sold to this exact
 * contact) — no email/DNI matching needed, unlike the public activation-link
 * flow, since the external backend already authenticated this end customer.
 */
export async function createClientClaim(
  contactId: string,
  data: {
    installationId: string;
    description: string;
    reporterName: string;
    reporterEmail: string;
    reporterPhone?: string;
  }
): Promise<{ ok: true; id: string; status: string } | { ok: false; error: string; status: number }> {
  const installation = await prisma.warrantyInstallation.findFirst({
    where: {
      id: data.installationId,
      roll: { saleItem: { sale: { contactId } } },
    },
  });
  if (!installation) {
    return { ok: false, error: "Instalación no encontrada", status: 404 };
  }
  if (installation.status !== "ACTIVE") {
    return { ok: false, error: "Esta garantía no está activa", status: 400 };
  }

  const claim = await prisma.warrantyClaim.create({
    data: {
      installationId: installation.id,
      description: data.description,
      reporterName: data.reporterName,
      reporterEmail: data.reporterEmail,
      reporterPhone: data.reporterPhone ?? null,
      channel: "CLIENT_PORTAL_API",
    },
  });

  await notifyAdmins({
    type: "WARRANTY_CLAIM",
    title: "Nuevo reclamo de garantía (portal de clientes)",
    message: `${data.reporterName} reportó un problema (${installation.installationCode})`,
    link: `/warranty-claims`,
  });

  return { ok: true, id: claim.id, status: claim.status };
}

/** Notifies a CLIENT contact's portal of a newly registered purchase. */
export async function notifyNewPurchase(contactId: string, saleNumber: number, total: number) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, type: "CLIENT" }, select: { id: true } });
  if (!contact) return;

  await prisma.portalNotification.create({
    data: {
      contactId,
      type: "NEW_PURCHASE",
      title: "Nueva compra registrada",
      message: `Se registró tu compra #${saleNumber} por un total de $${total}.`,
    },
  });
}

/** Notifies the owning CLIENT contact's portal that a Usuario activated a warranty on one of their rolls. */
export async function notifyWarrantyActivated(installationId: string) {
  const installation = await prisma.warrantyInstallation.findUnique({
    where: { id: installationId },
    select: {
      installationCode: true,
      clientName: true,
      roll: { select: { saleItem: { select: { sale: { select: { contactId: true } } } } } },
    },
  });
  const contactId = installation?.roll.saleItem?.sale.contactId;
  if (!contactId) return;

  const contact = await prisma.contact.findFirst({ where: { id: contactId, type: "CLIENT" }, select: { id: true } });
  if (!contact) return;

  await prisma.portalNotification.create({
    data: {
      contactId,
      type: "WARRANTY_ACTIVATED",
      title: "Garantía activada",
      message: `${installation?.clientName || "Un usuario"} activó la garantía ${installation?.installationCode}.`,
    },
  });
}

/** Notifications for a CLIENT contact's portal — unread, plus everything from the last 24h. */
export async function getClientNotifications(contactId: string) {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.portalNotification.findMany({
    where: {
      contactId,
      OR: [{ read: false }, { createdAt: { gte: since24h } }],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
