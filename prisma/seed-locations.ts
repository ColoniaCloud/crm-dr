import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * One-off setup for the roll-location system:
 * 1. Creates the singleton Depósito and Local locations (idempotent).
 * 2. Backfills currentLocationId = Depósito on every existing IN_STOCK roll
 *    that predates this system (they never moved, so Depósito is the only
 *    honest default).
 */
async function findOrCreateSingleton(type: "DEPOSITO" | "LOCAL", name: string) {
  const existing = await prisma.location.findFirst({ where: { type } });
  if (existing) return existing;
  return prisma.location.create({ data: { type, name } });
}

async function main() {
  const deposito = await findOrCreateSingleton("DEPOSITO", "Depósito");
  console.log(`Depósito: ${deposito.id}`);

  const local = await findOrCreateSingleton("LOCAL", "Local");
  console.log(`Local: ${local.id}`);

  const result = await prisma.warrantyRoll.updateMany({
    where: { status: "IN_STOCK", currentLocationId: null },
    data: { currentLocationId: deposito.id },
  });
  console.log(`Backfill: ${result.count} rollo(s) IN_STOCK asignados a Depósito`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
