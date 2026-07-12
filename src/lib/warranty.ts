import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { addMonths } from "date-fns";
import type { Prisma } from "@prisma/client";

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
  const config = await tx.warrantyConfig.findUnique({ where: { productId } });
  if (!config) return;

  const seq = (await tx.warrantyLot.count()) + 1;
  const lotNumber = buildLotNumber(LOT_PREFIX[source.type], seq);

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
        })),
      },
    },
  });
}

const ROLL_TRACE_INCLUDE = {
  lot: true,
  product: { select: { id: true, name: true, sku: true } },
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
 * warranty system stays consistent with what was actually sold. Otherwise
 * falls back to FIFO: the oldest IN_STOCK roll for the product.
 * No-op if no matching roll is available.
 */
export async function linkRollToSaleItem(
  tx: Tx,
  saleItemId: string,
  productId: string,
  productUnitId?: string | null
): Promise<void> {
  const roll = productUnitId
    ? await tx.warrantyRoll.findFirst({ where: { unitId: productUnitId, status: "IN_STOCK", saleItemId: null } })
    : await tx.warrantyRoll.findFirst({
        where: { productId, status: "IN_STOCK", saleItemId: null },
        orderBy: { createdAt: "asc" },
      });
  if (!roll) return;

  await tx.warrantyRoll.update({
    where: { id: roll.id },
    data: {
      saleItemId,
      status: "SOLD",
      installations: {
        create: {
          installationNumber: 1,
          installationCode: `${roll.fullRollCode}-I1`,
          status: "PENDING",
        },
      },
    },
  });
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
 * Activates a warranty installation slot with client and asset data.
 * Expiry is calculated from warrantyConfig.warrantyMonths (defaults to 12).
 */
export async function activateInstallationWarranty(
  installationId: string,
  data: {
    assetType: "VEHICLE" | "WINDOW" | "BUILDING" | "OTHER";
    assetDescription?: string;
    clientName: string;
    clientEmail: string;
    clientPhone?: string;
    clientDni?: string;
    installedAt?: Date;
    installerName?: string;
    notes?: string;
  }
): Promise<{ expiresAt: Date }> {
  return prisma.$transaction(async (tx) => {
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
        clientEmail: data.clientEmail,
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
  });
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
        },
      },
    },
  });
  if (!installation) return null;

  const now = new Date();
  const isExpired =
    installation.status === "ACTIVE" &&
    installation.expiresAt != null &&
    installation.expiresAt < now;

  return {
    installationCode: installation.installationCode,
    activationToken: installation.activationToken,
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
 * same shape as verifyWarranty() (no extra data exposed), or null if the
 * installation/password don't match or no password was ever set.
 */
export async function verifyInstallationLogin(installationCode: string, password: string) {
  const installation = await prisma.warrantyInstallation.findUnique({
    where: { installationCode },
    select: { activationToken: true, portalPasswordHash: true },
  });
  if (!installation?.portalPasswordHash) return null;

  const matches = await bcrypt.compare(password, installation.portalPasswordHash);
  if (!matches) return null;

  return verifyWarranty(installation.activationToken);
}
