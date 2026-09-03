import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { addMonths } from "date-fns";
import type { Prisma } from "@prisma/client";
import { notifyAdmins } from "@/lib/notifications";
import { workshopLogoPath } from "@/lib/workshop-logo";

type Tx = Prisma.TransactionClient;

const LOT_PREFIX = {
  PURCHASE_ORDER: "LOT",
  MANUAL_ADJUSTMENT: "LOT-ADJ",
  UNIT_CREATION: "LOT-UNIT",
} as const;

type WarrantyRollSourceType = keyof typeof LOT_PREFIX;

function buildLotNumber(prefix: string, seq: number): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix}-${d}-${String(seq).padStart(4, "0")}`;
}

/**
 * Token de activación de una instalación. Es la capacidad completa sobre la
 * garantía: quien lo tiene puede activarla, ponerle contraseña y abrir un
 * reclamo. Por eso NO puede ser el `cuid()` que traía el schema por defecto —
 * cuid v1 mezcla timestamp, un contador secuencial y un fingerprint de máquina,
 * y los rollos se dan de alta en lote, así que los tokens de un mismo lote
 * quedan con contadores contiguos y son adivinables a partir de uno conocido.
 *
 * 32 bytes de `randomBytes`, el mismo criterio que ya se había tomado para los
 * tokens del portal (lib/portal-tokens.ts). Los tokens cuid que ya existen en
 * la base siguen funcionando: esto solo cambia los nuevos.
 */
export function newActivationToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * `EXPIRED` se CALCULA, nunca se persiste: no hay job que escriba la columna,
 * así que una instalación vencida sigue diciendo `ACTIVE` en la base para
 * siempre. Cualquier chequeo de "¿esta garantía sigue vigente?" tiene que pasar
 * por acá y no por `installation.status` a secas.
 */
export function isWarrantyExpired(installation: {
  status: string;
  expiresAt: Date | null;
}, now: Date = new Date()): boolean {
  return (
    installation.status === "ACTIVE" &&
    installation.expiresAt != null &&
    installation.expiresAt < now
  );
}

/** Vigente = ACTIVE en la columna y además no vencida por fecha. */
export function isWarrantyClaimable(installation: {
  status: string;
  expiresAt: Date | null;
}, now: Date = new Date()): boolean {
  return installation.status === "ACTIVE" && !isWarrantyExpired(installation, now);
}

/**
 * Every rollo entering stock is put in custody of Depósito by default —
 * that's where imports physically land. Looked up rather than cached: it's
 * a cheap, rarely-changing singleton row, and this keeps ensureWarrantyRolls
 * from needing a caller-supplied id.
 */
async function getDepositoId(tx: Tx): Promise<string | null> {
  const deposito = await tx.location.findFirst({ where: { type: "DEPOSITO" } });
  return deposito?.id ?? null;
}

/**
 * Creates a WarrantyLot with one WarrantyRoll per unit entering stock.
 * No-op if the product has no WarrantyConfig. Called from every stock-in
 * path (PO receive, manual adjustments, unit creation) so every unit of
 * a warranty-enabled product is traceable regardless of how it entered stock.
 */
export async function ensureWarrantyRolls(
  tx: Tx,
  productId: string,
  quantity: number,
  source: {
    type: WarrantyRollSourceType;
    referenceId?: string;
    unitIds?: string[];
  }
): Promise<void> {
  // `warrantyEnabled: false` es un producto al que se le apagó la garantía:
  // no tiene que generar rollos nuevos. Antes solo se miraba que la config
  // existiera, y quedaba inconsistente con linkRollToSaleItem, que sí mira el
  // flag — un producto con la garantía apagada generaba rollos que después
  // nunca se asignaban.
  const config = await tx.warrantyConfig.findUnique({ where: { productId } });
  if (!config?.warrantyEnabled) return;

  const seq = (await tx.warrantyLot.count()) + 1;
  const lotNumber = buildLotNumber(LOT_PREFIX[source.type], seq);
  const depositoId = await getDepositoId(tx);

  await tx.warrantyLot.create({
    data: {
      purchaseOrderId: source.type === "PURCHASE_ORDER" ? source.referenceId : null,
      productId,
      lotNumber,
      quantity,
      rolls: {
        create: Array.from({ length: quantity }, (_, i) => ({
          productId,
          fullRollCode: `${lotNumber}-R${String(i + 1).padStart(3, "0")}`,
          unitId: source.unitIds?.[i] ?? null,
          currentLocationId: depositoId,
        })),
      },
    },
  });
}

const ROLL_TRACE_INCLUDE = {
  lot: true,
  product: {
    select: {
      id: true,
      name: true,
      sku: true,
      category: true,
      warrantyConfig: { select: { maxInstallations: true } },
    },
  },
  // Custodia actual mientras el rollo sigue IN_STOCK (Depósito/Local/Punto de
  // Reventa). Queda con el último valor conocido incluso después de vendido
  // — ver linkRollToSaleItem — así que para saber "dónde está" hoy siempre
  // hay que mirar el status primero: si tiene saleItem, está en Instalador.
  currentLocation: {
    select: {
      id: true,
      type: true,
      name: true,
      contactId: true,
    },
  },
  saleItem: {
    include: {
      sale: {
        select: {
          id: true,
          number: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
          contact: {
            select: { id: true, firstName: true, lastName: true, company: true },
          },
        },
      },
    },
  },
  installations: {
    orderBy: { installationNumber: "asc" as const },
    select: {
      id: true,
      installationNumber: true,
      installationCode: true,
      activationToken: true,
      status: true,
      clientName: true,
      clientEmail: true,
      clientPhone: true,
      clientDni: true,
      assetType: true,
      assetDescription: true,
      installerName: true,
      activatedAt: true,
      expiresAt: true,
    },
  },
  _count: {
    select: { installations: { where: { status: "ACTIVE" as const } } },
  },
} satisfies Prisma.WarrantyRollInclude;

/**
 * Resolves the live traceability of a roll (seller, client, active
 * installations) by its fullRollCode. The code itself is a stable
 * lookup key — this data is always fetched fresh, never embedded in it.
 */
export async function getRollByCode(fullRollCode: string) {
  return prisma.warrantyRoll.findUnique({
    where: { fullRollCode },
    include: ROLL_TRACE_INCLUDE,
  });
}

export async function getRollsWhere(where: Prisma.WarrantyRollWhereInput) {
  return prisma.warrantyRoll.findMany({
    where,
    include: ROLL_TRACE_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Links a WarrantyRoll to a SaleItem and creates one PENDING installation
 * slot on it. If the SaleItem already points at a specific traced unit
 * (productUnitId), it must use THAT unit's roll — not a random one — so the
 * warranty system stays consistent with what was actually sold. Otherwise:
 * prefer a roll already consigned at the buyer's OWN Punto de Reventa (saves
 * the buyer a physical shipment — they already have it on their shelf), and
 * only fall back to general FIFO (oldest IN_STOCK roll for the product,
 * anywhere) if they don't have one sitting there. No-op if no matching roll
 * is available.
 */
/**
 * Resultado de intentar asignarle un rollo de garantía a una línea de venta.
 *
 * `sin-rollos-libres` es el que importa: el producto tiene garantía
 * configurada, así que la venta **debería** llevar un rollo, pero no quedaba
 * ninguno sin vender. Antes esto era un `return` mudo — la venta se confirmaba,
 * nadie se enteraba, y el Cliente después abría su panel y veía la compra sin
 * stock. Que no se pueda asignar es un hecho legítimo; que no se avise, no.
 */
export type RollLinkResult =
  | { assigned: true; fullRollCode: string }
  | { assigned: false; reason: "sin-garantia" | "sin-rollos-libres" };

export async function linkRollToSaleItem(
  tx: Tx,
  saleItemId: string,
  productId: string,
  productUnitId?: string | null,
  buyerContactId?: string | null
): Promise<RollLinkResult> {
  // Un producto sin garantía configurada no lleva rollo, y eso está bien: no
  // todo lo que se vende entra en la cadena de garantías. Distinguirlo del
  // caso "debería llevar y no había" es la mitad del arreglo.
  const config = await tx.warrantyConfig.findUnique({
    where: { productId },
    select: { warrantyEnabled: true },
  });
  if (!config?.warrantyEnabled) return { assigned: false, reason: "sin-garantia" };

  let roll = productUnitId
    ? await tx.warrantyRoll.findFirst({ where: { unitId: productUnitId, status: "IN_STOCK", saleItemId: null } })
    : null;

  if (!roll && !productUnitId && buyerContactId) {
    roll = await tx.warrantyRoll.findFirst({
      where: {
        productId,
        status: "IN_STOCK",
        saleItemId: null,
        currentLocation: { type: "PUNTO_REVENTA", contactId: buyerContactId },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  if (!roll && !productUnitId) {
    roll = await tx.warrantyRoll.findFirst({
      where: { productId, status: "IN_STOCK", saleItemId: null },
      orderBy: { createdAt: "asc" },
    });
  }

  // Hay garantía configurada pero no quedó ningún rollo sin vender. La venta
  // sigue —el stock existe, la mercadería sale— pero quien llama tiene que
  // enterarse, porque el Cliente va a abrir su panel y no va a ver el rollo.
  if (!roll) return { assigned: false, reason: "sin-rollos-libres" };

  await tx.warrantyRoll.update({
    where: { id: roll.id },
    data: {
      saleItemId,
      status: "SOLD",
      // currentLocationId is deliberately left as-is, not cleared: once SOLD
      // the roll's "location" for display purposes is derived from the sale
      // (see the /api/warranty-rolls list), but keeping the last physical
      // location means releaseRollForSaleItem (sale deleted/reversed) puts
      // it back exactly where it physically was, no extra bookkeeping.
      installations: {
        create: {
          installationNumber: 1,
          installationCode: `${roll.fullRollCode}-I1`,
          activationToken: newActivationToken(),
          status: "PENDING",
        },
      },
    },
  });

  return { assigned: true, fullRollCode: roll.fullRollCode };
}

/**
 * Undoes linkRollToSaleItem when a SaleItem is about to be deleted (sale
 * deletion, unit reassignment, or a cascading contact/client/lead delete).
 * If the client already activated the warranty (an ACTIVE installation
 * exists), the roll is left alone — returning an activated roll to the
 * sellable FIFO pool would let two different customers end up holding the
 * same "unique" warranty code, which is worse than leaving it orphaned.
 * No-op if the SaleItem never had a roll assigned.
 */
export async function releaseRollForSaleItem(tx: Tx, saleItemId: string): Promise<void> {
  const roll = await tx.warrantyRoll.findUnique({
    where: { saleItemId },
    include: { installations: { select: { status: true } } },
  });
  if (!roll) return;

  const hasActiveInstallation = roll.installations.some((i) => i.status === "ACTIVE");
  if (hasActiveInstallation) return;

  await tx.warrantyInstallation.deleteMany({ where: { rollId: roll.id, status: "PENDING" } });
  await tx.warrantyRoll.update({
    where: { id: roll.id },
    data: { saleItemId: null, status: "IN_STOCK" },
  });
}

/**
 * Moves an IN_STOCK roll between Depósito/Local/Punto de Reventa — a purely
 * internal custody change, not a sale: no warranty status changes, no stock
 * movement is recorded (total company stock doesn't change, only who's
 * holding it). Logs a WarrantyRollLocationEvent for audit, same spirit as
 * StockMovement elsewhere in the system.
 */
export async function transferRollLocation(
  fullRollCode: string,
  toLocationId: string,
  userId: string,
  reason?: string
): Promise<
  | { ok: true }
  | { ok: false; error: string; status: number }
> {
  return prisma.$transaction(async (tx) => {
    const roll = await tx.warrantyRoll.findUnique({
      where: { fullRollCode },
      select: { id: true, status: true, currentLocationId: true },
    });
    if (!roll) return { ok: false as const, error: "Rollo no encontrado", status: 404 };
    if (roll.status !== "IN_STOCK") {
      return { ok: false as const, error: "Solo se pueden mover rollos que siguen en stock (IN_STOCK)", status: 400 };
    }

    const toLocation = await tx.location.findUnique({ where: { id: toLocationId } });
    if (!toLocation || !toLocation.active) {
      return { ok: false as const, error: "Ubicación de destino no encontrada", status: 404 };
    }

    await tx.warrantyRoll.update({
      where: { id: roll.id },
      data: { currentLocationId: toLocationId },
    });

    await tx.warrantyRollLocationEvent.create({
      data: {
        rollId: roll.id,
        fromLocationId: roll.currentLocationId,
        toLocationId,
        userId,
        reason,
      },
    });

    return { ok: true as const };
  });
}

const DEFAULT_MAX_INSTALLATIONS = 15;

/**
 * Creates an additional installation slot on a roll already owned by a
 * CLIENT contact (structural ownership: sold to them via a completed Sale,
 * same check as createClientClaim in client-portal.ts). Lets a partner like
 * NL360 self-serve a new sub-code each time they cut a fresh piece off a
 * roll they bought, up to the product's maxInstallations.
 */
export async function createAdditionalInstallation(
  contactId: string,
  fullRollCode: string
): Promise<
  | {
      ok: true;
      installation: { id: string; installationNumber: number; installationCode: string; activationToken: string; status: string };
      rollStatus: string;
    }
  | { ok: false; error: string; status: number }
> {
  const result = await prisma.$transaction(async (tx) => {
    const roll = await tx.warrantyRoll.findFirst({
      where: { fullRollCode, saleItem: { sale: { contactId } } },
      include: {
        installations: { select: { id: true } },
        product: { select: { warrantyConfig: { select: { maxInstallations: true } } } },
      },
    });
    if (!roll) {
      return { ok: false as const, error: "Rollo no encontrado", status: 404 };
    }
    if (roll.status === "VOIDED" || roll.status === "EXHAUSTED") {
      return { ok: false as const, error: "Este rollo ya no admite más instalaciones", status: 400 };
    }

    const maxInstallations = roll.product.warrantyConfig?.maxInstallations ?? DEFAULT_MAX_INSTALLATIONS;
    const nextNumber = roll.installations.length + 1;

    if (roll.installations.length >= maxInstallations) {
      await tx.warrantyRoll.update({ where: { id: roll.id }, data: { status: "EXHAUSTED" } });
      return { ok: false as const, error: "Este rollo ya no admite más instalaciones", status: 400 };
    }

    const installation = await tx.warrantyInstallation.create({
      data: {
        rollId: roll.id,
        installationNumber: nextNumber,
        installationCode: `${fullRollCode}-I${nextNumber}`,
        activationToken: newActivationToken(),
        status: "PENDING",
      },
      select: { id: true, installationNumber: true, installationCode: true, activationToken: true, status: true },
    });

    const rollStatus = nextNumber >= maxInstallations ? "EXHAUSTED" : roll.status;
    if (rollStatus === "EXHAUSTED") {
      await tx.warrantyRoll.update({ where: { id: roll.id }, data: { status: "EXHAUSTED" } });
    }

    return { ok: true as const, installation, rollStatus };
  });

  if (result.ok) {
    await notifyAdmins({
      type: "WARRANTY_SUBCODE_CREATED",
      title: "Nuevo sub-código de garantía (portal de clientes)",
      message: `Se generó una nueva instalación (${result.installation.installationCode}) sobre el rollo ${fullRollCode}`,
      link: "/warranty-claims",
    });
  }

  return result;
}

/**
 * Activates a warranty installation slot with client and asset data.
 * Expiry is calculated from warrantyConfig.warrantyMonths (defaults to 12).
 */
export interface ActivateWarrantyData {
  assetType: "VEHICLE" | "WINDOW" | "BUILDING" | "OTHER";
  assetDescription?: string | null;
  clientName: string;
  /**
   * Opcional a propósito. El flujo público siempre lo tiene —lo escribe el
   * usuario final en el formulario—, pero el del taller no: un cliente de
   * mostrador puede no haber dejado mail. Preferimos generarle la garantía
   * igual, porque el trabajo se hizo, y avisar que no se le pudo mandar; no
   * darle cobertura por no tener su email sería castigar al que menos culpa
   * tiene.
   */
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientDni?: string | null;
  installedAt?: Date | null;
  installerName?: string | null;
  notes?: string | null;
}

/**
 * Activa una instalación **dentro de una transacción que abre el que llama.**
 *
 * Existe separada de `activateInstallationWarranty` porque aquella abre su
 * propia `$transaction`, y anidar transacciones de Prisma toma una segunda
 * conexión del pool con la primera todavía abierta — receta de deadlock. La
 * Fase 4 necesita activar la garantía en la MISMA transacción que cierra la
 * orden de trabajo, así que la lógica vive acá y las dos entradas la comparten.
 */
export async function activateInstallationWarrantyTx(
  tx: Tx,
  installationId: string,
  data: ActivateWarrantyData
): Promise<{ expiresAt: Date }> {
  const installation = await tx.warrantyInstallation.findUnique({
    where: { id: installationId },
    include: {
      roll: {
        include: { product: { include: { warrantyConfig: true } } },
      },
    },
  });
  if (!installation) throw new Error(`Installation ${installationId} not found`);
  if (installation.status !== "PENDING") {
    throw new Error(`Installation ${installationId} is not in PENDING status`);
  }

  const months = installation.roll.product.warrantyConfig?.installWarrantyMonths ?? 12;
  const activatedAt = new Date();
  const expiresAt = addMonths(activatedAt, months);

  await tx.warrantyInstallation.update({
    where: { id: installationId },
    data: {
      assetType: data.assetType,
      assetDescription: data.assetDescription ?? null,
      clientName: data.clientName,
      clientEmail: data.clientEmail ?? null,
      clientPhone: data.clientPhone ?? null,
      clientDni: data.clientDni ?? null,
      installedAt: data.installedAt ?? null,
      installerName: data.installerName ?? null,
      notes: data.notes ?? null,
      activatedAt,
      expiresAt,
      status: "ACTIVE",
    },
  });

  await tx.warrantyRoll.update({
    where: { id: installation.rollId },
    data: { status: "IN_USE" },
  });

  return { expiresAt };
}

/** Entrada pública: activa abriendo su propia transacción. */
export async function activateInstallationWarranty(
  installationId: string,
  data: ActivateWarrantyData
): Promise<{ expiresAt: Date }> {
  return prisma.$transaction((tx) => activateInstallationWarrantyTx(tx, installationId, data));
}

/**
 * Reserva un slot de instalación en un rollo, dentro de una transacción ajena.
 *
 * Reusa el `-I1` que `linkRollToSaleItem` deja en PENDING al vender el rollo;
 * recién cuando no queda ninguno libre crea el siguiente sub-código. Es la
 * misma cuenta que hace `createAdditionalInstallation` (sección 4.8 del
 * contrato), sin abrir transacción propia.
 *
 * Devuelve null cuando el rollo ya no admite más instalaciones o está anulado.
 * El que llama decide si eso es un error o algo que se reporta y sigue.
 */
export async function allocateInstallationTx(
  tx: Tx,
  rollId: string
): Promise<{ id: string; installationCode: string; activationToken: string } | null> {
  const roll = await tx.warrantyRoll.findUnique({
    where: { id: rollId },
    select: {
      id: true,
      fullRollCode: true,
      status: true,
      installations: {
        orderBy: { installationNumber: "asc" },
        select: {
          id: true,
          installationNumber: true,
          installationCode: true,
          activationToken: true,
          status: true,
        },
      },
      product: { select: { warrantyConfig: { select: { maxInstallations: true } } } },
    },
  });
  if (!roll || roll.status === "VOIDED") return null;

  const libre = roll.installations.find((i) => i.status === "PENDING");
  if (libre) {
    return {
      id: libre.id,
      installationCode: libre.installationCode,
      activationToken: libre.activationToken,
    };
  }

  const maxInstallations = roll.product.warrantyConfig?.maxInstallations ?? DEFAULT_MAX_INSTALLATIONS;
  const nextNumber = roll.installations.length + 1;
  if (nextNumber > maxInstallations) {
    await tx.warrantyRoll.update({ where: { id: roll.id }, data: { status: "EXHAUSTED" } });
    return null;
  }

  const creada = await tx.warrantyInstallation.create({
    data: {
      rollId: roll.id,
      installationNumber: nextNumber,
      installationCode: `${roll.fullRollCode}-I${nextNumber}`,
      activationToken: newActivationToken(),
      status: "PENDING",
    },
    select: { id: true, installationCode: true, activationToken: true },
  });

  if (nextNumber >= maxInstallations) {
    await tx.warrantyRoll.update({ where: { id: roll.id }, data: { status: "EXHAUSTED" } });
  }

  return creada;
}

/**
 * Looks up a warranty by activation token and returns its current status.
 * Returns null if not found.
 */
export async function verifyWarranty(activationToken: string) {
  const installation = await prisma.warrantyInstallation.findUnique({
    where: { activationToken },
    include: {
      roll: {
        include: {
          lot: true,
          product: { select: { id: true, name: true, brand: true } },
          // Quién vendió el rollo, o sea el taller que hizo el trabajo. Se usa
          // para firmar la garantía con su nombre y su logo.
          saleItem: {
            select: {
              sale: {
                select: {
                  contact: {
                    select: {
                      id: true,
                      company: true,
                      firstName: true,
                      lastName: true,
                      workshopSettings: {
                        select: { workshopName: true, logo: true, logoSlug: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!installation) return null;

  // Nombre y logo del taller. **Es lo único del vendedor que sale del CRM**, y
  // no es dato sensible: el nombre comercial y el logo están en la fachada del
  // local. No sale el contactId —el logo va por un slug aleatorio justamente
  // para eso—, ni el email, ni la ubicación; esto último fue el hallazgo F0-24.
  //
  // `installerName` de la instalación manda sobre la config actual: la garantía
  // dice quién hizo ESE trabajo, no cómo se llama el taller hoy.
  const vendedor = installation.roll.saleItem?.sale.contact ?? null;
  const installer = vendedor
    ? {
        name:
          installation.installerName?.trim() ||
          vendedor.workshopSettings?.workshopName?.trim() ||
          vendedor.company?.trim() ||
          `${vendedor.firstName} ${vendedor.lastName}`.trim(),
        logoPath:
          vendedor.workshopSettings?.logo && vendedor.workshopSettings.logoSlug
            ? workshopLogoPath(vendedor.workshopSettings.logoSlug)
            : null,
      }
    : installation.installerName?.trim()
      ? { name: installation.installerName.trim(), logoPath: null }
      : null;

  const now = new Date();
  const isExpired = isWarrantyExpired(installation, now);

  return {
    installationCode: installation.installationCode,
    activationToken: installation.activationToken,
    installer,
    status: isExpired ? ("EXPIRED" as const) : installation.status,
    product: installation.roll.product,
    lotNumber: installation.roll.lot.lotNumber,
    fullRollCode: installation.roll.fullRollCode,
    assetType: installation.assetType,
    assetDescription: installation.assetDescription,
    clientName: installation.clientName,
    clientEmail: installation.clientEmail,
    clientPhone: installation.clientPhone,
    clientDni: installation.clientDni,
    installedAt: installation.installedAt,
    activatedAt: installation.activatedAt,
    expiresAt: installation.expiresAt,
    isActive: installation.status === "ACTIVE" && !isExpired,
    daysRemaining:
      installation.status === "ACTIVE" && installation.expiresAt && !isExpired
        ? Math.ceil((installation.expiresAt.getTime() - now.getTime()) / 86_400_000)
        : 0,
  };
}

/**
 * Full status of a warranty as resolved by verifyWarranty() — includes the
 * activationToken and the end customer's PII, so it must never leave the CRM
 * unprojected. Use pickPublicStatus() at the edge.
 */
export type WarrantyStatus = NonNullable<Awaited<ReturnType<typeof verifyWarranty>>>;

/**
 * The public subset of a warranty status: exactly what
 * GET /api/public/warranty/:token and POST /api/public/warranty/login return
 * (WARRANTY_API.md 5.1 y 5.5). Deliberately omits the activationToken — which
 * IS the full capability over the warranty — and every personal field
 * (clientName/Email/Phone/Dni), plus the internal lotNumber/fullRollCode.
 * Both public routes go through here so they cannot drift apart again.
 */
export function pickPublicStatus(warranty: WarrantyStatus) {
  return {
    installationCode: warranty.installationCode,
    status: warranty.status,
    product: warranty.product,
    isActive: warranty.isActive,
    daysRemaining: warranty.daysRemaining,
    expiresAt: warranty.expiresAt,
    assetType: warranty.assetType,
    // Nombre y logo del taller que hizo el trabajo. Es marca comercial, no dato
    // personal — ver la nota en verifyWarranty. `logoPath` es relativo al CRM;
    // quien lo muestre tiene que anteponerle la base del CRM, no la suya.
    installer: warranty.installer,
  };
}

/**
 * Lets the Usuario (end car owner) set a simple password on their own
 * installation, so they can check on it later with just their short
 * installationCode instead of the long activationToken. Knowing the token
 * already proves legitimacy, same as activating.
 */
export async function setInstallationPortalPassword(
  activationToken: string,
  password: string
): Promise<void> {
  const installation = await prisma.warrantyInstallation.findUnique({
    where: { activationToken },
    select: { id: true },
  });
  if (!installation) throw new Error(`Installation with token ${activationToken} not found`);

  const portalPasswordHash = await bcrypt.hash(password, 10);
  await prisma.warrantyInstallation.update({
    where: { id: installation.id },
    data: { portalPasswordHash },
  });
}

/**
 * Verifies a Usuario's simple installationCode + password login. Returns the
 * PUBLIC subset (pickPublicStatus) — the same shape as
 * GET /api/public/warranty/:token — or null if the installation/password don't
 * match or no password was ever set. It must NOT return the full
 * verifyWarranty() row: that carries the activationToken and the titular's PII,
 * and this response is forwarded to the browser (and signed into the session
 * cookie) by kristall-web.
 */
export async function verifyInstallationLogin(installationCode: string, password: string) {
  const installation = await prisma.warrantyInstallation.findUnique({
    where: { installationCode },
    select: { activationToken: true, portalPasswordHash: true },
  });
  if (!installation?.portalPasswordHash) return null;

  const matches = await bcrypt.compare(password, installation.portalPasswordHash);
  if (!matches) return null;

  const warranty = await verifyWarranty(installation.activationToken);
  if (!warranty) return null;

  return pickPublicStatus(warranty);
}
