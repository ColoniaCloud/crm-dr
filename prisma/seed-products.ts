import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Get the last product's image (most recently created product with an image)
  const lastProduct = await prisma.product.findFirst({
    where: { imageUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { imageUrl: true },
  });

  const imageUrl = lastProduct?.imageUrl ?? null;

  // Pack pricing: 1→300, 2→550, 3→750
  const packTiers = [
    { tierType: "PACK", minQty: 1, price: 300 },
    { tierType: "PACK", minQty: 2, price: 550 },
    { tierType: "PACK", minQty: 3, price: 750 },
  ];

  // Volume pricing: 10→220, 20→200, 30→190, 40+→180
  const volumeTiers = [
    { tierType: "VOLUME", minQty: 10, price: 220 },
    { tierType: "VOLUME", minQty: 20, price: 200 },
    { tierType: "VOLUME", minQty: 30, price: 190 },
    { tierType: "VOLUME", minQty: 40, price: 180 },
  ];

  const allTiers = [...packTiers, ...volumeTiers];

  const productsToCreate = [
    { name: "Premium 05", subcategory: "PREMIUM", shade: "05" },
    { name: "Premium 15", subcategory: "PREMIUM", shade: "15" },
    { name: "Premium 35", subcategory: "PREMIUM", shade: "35" },
    { name: "Nano Carbono 05", subcategory: "NANOCARBON", shade: "05" },
    { name: "Nano Carbono 15", subcategory: "NANOCARBON", shade: "15" },
  ];

  for (const p of productsToCreate) {
    // Check if product already exists
    const existing = await prisma.product.findFirst({
      where: { name: p.name, category: "AUTOMOTIVE" },
    });

    if (existing) {
      console.log(`⏭ ${p.name} ya existe, omitido.`);
      continue;
    }

    const product = await prisma.product.create({
      data: {
        name: p.name,
        category: "AUTOMOTIVE",
        subcategory: p.subcategory,
        shade: p.shade,
        price: 300,
        cost: 150,
        stock: 0,
        minStock: 5,
        imageUrl,
        active: true,
        priceTiers: {
          create: allTiers,
        },
      },
    });

    console.log(`✅ ${product.name} creado (id: ${product.id})`);
  }

  console.log("\nProductos creados exitosamente.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
