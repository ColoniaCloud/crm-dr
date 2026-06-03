import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const skus: Array<{ name: string; sku: string }> = [
  { name: "Nano Carbono 15", sku: "NCAR15" },
  { name: "Nano Carbono 05", sku: "NCAR5" },
  { name: "Premium 35",      sku: "APRE35" },
  { name: "Premium 15",      sku: "APRE15" },
  { name: "Premium 05",      sku: "APRE5"  },
];

async function main() {
  let updated = 0;
  const notFound: string[] = [];

  for (const entry of skus) {
    const product = await prisma.product.findFirst({ where: { name: entry.name } });
    if (!product) {
      console.warn(`[WARNING] Producto no encontrado: "${entry.name}"`);
      notFound.push(entry.name);
      continue;
    }
    await prisma.product.update({ where: { id: product.id }, data: { sku: entry.sku } });
    console.log(`  ✓ "${entry.name}" → SKU: ${entry.sku}`);
    updated++;
  }

  console.log(`\nResultado: ${updated} producto(s) actualizado(s).`);
  if (notFound.length > 0) {
    console.log(`No encontrados (${notFound.length}): ${notFound.join(", ")}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
