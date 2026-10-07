import { prisma } from "@/lib/prisma";
import { portalBaseUrl } from "@/lib/portal-tokens";
import type { Prisma } from "@prisma/client";
import { notifyAdmins } from "@/lib/notifications";
import { getClientBalance } from "@/lib/account";
import { isWarrantyClaimable } from "@/lib/warranty";
import { WHERE_COMPRADOR } from "@/lib/contact-types";
import { numeroOnull } from "@/lib/obra";
import { conResumen, crearReclamo, type DatosReclamo } from "@/lib/warranty-claims";

/** Contacts of type CLIENT are the only ones exposed to the portal API. */
export async function findClientContact(contactId: string) {
  return prisma.contact.findFirst({
    where: { id: contactId, ...WHERE_COMPRADOR },
    select: { id: true, firstName: true, lastName: true, company: true, email: true },
  });
}

/** Resolves a CLIENT contact by email. Used for the external backend's initial linking step. */
export async function lookupClientByEmail(email: string) {
  return prisma.contact.findMany({
    where: { ...WHERE_COMPRADOR, email },
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
    where: { id: contactId, ...WHERE_COMPRADOR },
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
      // `installWarrantyMonths` es la garantia que le queda al CLIENTE FINAL
      // —no `rollWarrantyMonths`, que cubre el rollo sin instalar—, y es la que
      // el instalador necesita poder decirle en el mostrador. `warrantyEnabled`
      // viaja con ella porque un producto puede tener config y tenerla apagada:
      // sin ese dato no se distingue de uno que si cubre.
      warrantyConfig: {
        select: {
          maxInstallations: true,
          installWarrantyMonths: true,
          warrantyEnabled: true,
        },
      },
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
      // Precargados por el taller. No son PII del cliente final —el mail, el
      // nombre y el telefono siguen sin salir por aca—: identifican el trabajo,
      // y el instalador necesita reconocer cual instalacion es cual.
      vehicleType: true,
      plate: true,
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
 * El stock de un **revendedor**: lo mismo que ve un instalador, más el link de
 * garantía de cada rollo listo para pasarle a quien se lo compre.
 *
 * ─── Por qué esto existe aparte y no se le agrega a PORTAL_ROLL_SELECT ─────
 *
 * Porque el `activationToken` está excluido de ese select **a propósito**: es
 * una capacidad al portador —quien lo tiene activa la garantía a nombre de
 * cualquiera— y ampliarlo para todos desharía una decisión de seguridad tomada
 * a conciencia (ver el comentario de PORTAL_ROLL_SELECT y el de
 * getClientInstallations).
 *
 * Un **instalador** no lo necesita: genera sus propios sub-códigos desde el
 * portal. Un **revendedor no instala**, así que el token es literalmente lo
 * único que le puede entregar a su comprador; sin él, el rollo sale, se vende,
 * se instala, y la garantía no se activa nunca.
 *
 * Se devuelve como URL armada y no como token pelado: es lo que se comparte, y
 * evita que cada pantalla tenga que saber cómo se construye el link.
 *
 * **Alcance:** esto cubre los rollos que el revendedor compró en firme. Cuando
 * exista la Fase D —el rollo pasa a nombre del taller y el taller genera sus
 * propias instalaciones— la vía normal deja de necesitar esto, y queda solo para
 * los rollos viejos. Ver §5.2 de REVENDEDORES.md.
 */
export async function getResellerStock(contactId: string) {
  const rolls = await prisma.warrantyRoll.findMany({
    where: { saleItem: { sale: { contactId } } },
    select: {
      ...PORTAL_ROLL_SELECT,
      installations: {
        orderBy: { installationNumber: "asc" as const },
        select: {
          ...PORTAL_ROLL_SELECT.installations.select,
          // Solo acá, y solo para este nivel.
          activationToken: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const base = portalBaseUrl();
  return rolls.map((roll) => {
    // El link que se entrega es el de la instalación que todavía nadie activó.
    // Si ya están todas activadas no hay nada que pasar, y devolver una URL que
    // lleva a "esta garantía ya fue activada" confunde más de lo que ayuda.
    const pendiente = roll.installations.find((i) => i.status === "PENDING");
    return {
      ...roll,
      // Sin el token pelado en la respuesta: lo que la pantalla necesita es el
      // link, y dejar los dos invita a que alguien loguee el token.
      installations: roll.installations.map(({ activationToken: _t, ...i }) => i),
      warrantyUrl: pendiente
        ? `${base}/garantia/${encodeURIComponent(pendiente.activationToken)}`
        : null,
    };
  });
}

/**
 * Warranty installations that live on rolls owned by this CLIENT contact.
 * Explicit select (CLIENT_PORTAL_API.md 4.3): a bare `include` would ship the
 * whole row — portalPasswordHash, activationToken, clientDni/Email/Phone,
 * installerName, notes — straight into the portal's HTML.
 */
export async function getClientInstallations(contactId: string) {
  const installations = await prisma.warrantyInstallation.findMany({
    where: { roll: { saleItem: { sale: { contactId } } } },
    select: {
      id: true,
      installationCode: true,
      status: true,
      assetType: true,
      assetDescription: true,
      // Datos de obra (arquitectura). La dirección va COMPLETA: el que pregunta
      // es el taller que hizo el trabajo, no un link reenviado. Ver
      // obraPublica() en warranty.ts para la versión recortada.
      siteAddress: true,
      areaM2: true,
      paneCount: true,
      glassType: true,
      filmSide: true,
      buildingUse: true,
      activatedAt: true,
      expiresAt: true,
      roll: {
        select: {
          fullRollCode: true,
          // `category` para que el portal sepa qué ficha dibujar sin adivinar
          // por qué campos vienen llenos.
          product: { select: { id: true, name: true, sku: true, category: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  // Decimal se serializa como string; afuera viaja como número.
  return installations.map((i) => ({ ...i, areaM2: numeroOnull(i.areaM2) }));
}

/**
 * Warranty claims filed on installations that belong to this CLIENT contact.
 * Explicit select (CLIENT_PORTAL_API.md 4.4), mismo criterio que 4.2 y 4.3: un
 * `include` pelado devuelve la fila entera — `reporterEmail`, `reporterPhone`,
 * `channel`, `assignedToId`, `resolutionNotes` — y aunque ahí no haya secretos,
 * `resolutionNotes` es una nota interna del operador y `assignedToId` es el
 * usuario del CRM que lo atiende. Nada de eso es del Cliente.
 */
export async function getClientClaims(contactId: string) {
  return prisma.warrantyClaim.findMany({
    where: { installation: { roll: { saleItem: { sale: { contactId } } } } },
    select: {
      id: true,
      status: true,
      description: true,
      // Qué se reclamó (null en reclamos anteriores a octubre 2026). Las fotos
      // no salen: son del cliente final y las evalúa Kristall, no el taller.
      issueType: true,
      affectedPanes: true,
      createdAt: true,
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
  },
  extras?: DatosReclamo | null
): Promise<{ ok: true; id: string; status: string } | { ok: false; error: string; status: number }> {
  const installation = await prisma.warrantyInstallation.findFirst({
    where: {
      id: data.installationId,
      roll: { saleItem: { sale: { contactId } } },
    },
    select: { id: true, installationCode: true, status: true, expiresAt: true },
  });
  if (!installation) {
    return { ok: false, error: "Instalación no encontrada", status: 404 };
  }
  // No alcanza con `status === "ACTIVE"`: EXPIRED se calcula y nunca se escribe
  // en la columna, así que una garantía vencida sigue figurando como ACTIVE.
  if (!isWarrantyClaimable(installation)) {
    return {
      ok: false,
      error:
        installation.status === "ACTIVE"
          ? "Esta garantía ya venció"
          : "Esta garantía no está activa",
      status: 400,
    };
  }

  const claim = await crearReclamo(
    {
      installationId: installation.id,
      description: data.description,
      reporterName: data.reporterName,
      reporterEmail: data.reporterEmail,
      reporterPhone: data.reporterPhone ?? null,
      channel: "CLIENT_PORTAL_API",
    },
    extras
  );
  if (!claim.ok) return claim;

  await notifyAdmins({
    type: "WARRANTY_CLAIM",
    // Un reclamo es alguien de afuera esperando respuesta: sale mail
    // además de la campanita. Ver la nota en notifyAdmins.
    email: true,
    title: "Nuevo reclamo de garantía (portal de clientes)",
    message: conResumen(`${data.reporterName} reportó un problema (${installation.installationCode})`, extras),
    link: `/warranty-claims`,
  });

  return { ok: true, id: claim.id, status: claim.status };
}

/** Notifies a CLIENT contact's portal of a newly registered purchase. */
export async function notifyNewPurchase(contactId: string, saleNumber: number, total: number) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, ...WHERE_COMPRADOR }, select: { id: true } });
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

  const contact = await prisma.contact.findFirst({ where: { id: contactId, ...WHERE_COMPRADOR }, select: { id: true } });
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
    // Select explícito: sin él se devuelve también el `contactId`, que el
    // consumidor ya conoce y no necesita ver repetido en cada fila.
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      // Deep link dentro del panel (p. ej. /cliente/cuenta#cuota-<id> para
      // INSTALLMENT_OVERDUE). Estaba en la base y se descartaba al serializar.
      link: true,
      read: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
