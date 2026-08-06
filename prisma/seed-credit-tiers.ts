import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TIERS = [
  { code: "A", name: "Escalafón A", limit: 200_000 },
  { code: "B", name: "Escalafón B", limit: 500_000 },
  { code: "C", name: "Escalafón C", limit: 1_000_000 },
  { code: "D", name: "Escalafón D", limit: 2_000_000 },
];

async function main() {
  for (const tier of TIERS) {
    const existing = await prisma.creditTier.findUnique({ where: { code: tier.code } });
    if (existing) {
      console.log(`Ya existe ${tier.code}, no se pisa (editalo desde /settings si hace falta)`);
      continue;
    }
    const created = await prisma.creditTier.create({ data: tier });
    console.log(`Creado ${created.code}: ${created.name} — límite $${created.limit}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
