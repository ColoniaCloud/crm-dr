import { prisma } from "@/lib/prisma";
import { addMonths } from "date-fns";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

function buildLotNumber(seq: number): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `LOT-${d}-${String(seq).padStart(4, "0")}`;
}

/**
 * Creates a WarrantyLot with one WarrantyRoll per unit received.
 * No-op if the product has no WarrantyConfig.
 */
export async function createWarrantyLot(
  tx: Tx,
  purchaseOrderId: string,
  productId: string,
  quantity: number
): Promise<void> {
  const config = await tx.warrantyConfig.findUnique({ where: { productId } });
  if (!config) return;

  const seq = (await tx.warrantyLot.count()) + 1;
  const lotNumber = buildLotNumber(seq);

  await tx.warrantyLot.create({
    data: {
      purchaseOrderId,
      productId,
      lotNumber,
      quantity,
      rolls: {
        create: Array.from({ length: quantity }, (_, i) => ({
          productId,
          fullRollCode: `${lotNumber}-R${String(i + 1).padStart(3, "0")}`,
        })),
      },
    },
  });
}

/**
 * Assigns the oldest IN_STOCK roll for a product to a SaleItem (FIFO)
 * and creates one PENDING installation slot on it.
 * No-op if no roll is available.
 */
export async function linkRollToSaleItem(
  tx: Tx,
  saleItemId: string,
  productId: string
): Promise<void> {
  const roll = await tx.warrantyRoll.findFirst({
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
