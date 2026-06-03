import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ProductSeed {
  name: string;
  sku: string;
  category: "AUTOMOTIVE" | "PPF";
  subcategory: string;
  shade: string | null;
  description: string;
  installWarrantyMonths: number;
}

const products: ProductSeed[] = [
  // ── KLAR — Premium Window Film ──────────────────────────────────────────────
  {
    name: "KLAR 05", sku: "KPRO05", category: "AUTOMOTIVE", subcategory: "PREMIUM", shade: "05",
    description: "Lámina con acabado consistente. 99% bloqueo UV. VLT 5%.",
    installWarrantyMonths: 36,
  },
  {
    name: "KLAR 15", sku: "KPRO15", category: "AUTOMOTIVE", subcategory: "PREMIUM", shade: "15",
    description: "Lámina con acabado consistente. 99% bloqueo UV. VLT 15%.",
    installWarrantyMonths: 36,
  },
  {
    name: "KLAR 30", sku: "KPRO30", category: "AUTOMOTIVE", subcategory: "PREMIUM", shade: "30",
    description: "Lámina con acabado consistente. 99% bloqueo UV. VLT 30%.",
    installWarrantyMonths: 36,
  },
  {
    name: "KLAR 50", sku: "KPRO50", category: "AUTOMOTIVE", subcategory: "PREMIUM", shade: "50",
    description: "Lámina con acabado consistente. 99% bloqueo UV. VLT 50%.",
    installWarrantyMonths: 36,
  },

  // ── KARBON — Nanocarbon Window Film ─────────────────────────────────────────
  {
    name: "KARBON 05", sku: "KNCA05", category: "AUTOMOTIVE", subcategory: "NANOCARBON", shade: "05",
    description: "Tecnología Nano Carbon. 99% bloqueo UV, 90% rechazo IR. VLT 5%.",
    installWarrantyMonths: 60,
  },
  {
    name: "KARBON 15", sku: "KNCA15", category: "AUTOMOTIVE", subcategory: "NANOCARBON", shade: "15",
    description: "Tecnología Nano Carbon. 99% bloqueo UV, 90% rechazo IR. VLT 15%.",
    installWarrantyMonths: 60,
  },
  {
    name: "KARBON 80", sku: "KNCA80", category: "AUTOMOTIVE", subcategory: "NANOCARBON", shade: "80",
    description: "Tecnología Nano Carbon. 99% bloqueo UV, 90% rechazo IR. VLT 80%.",
    installWarrantyMonths: 60,
  },

  // ── KERAMX — Nanoceramic Window Film ────────────────────────────────────────
  {
    name: "KERAMX 05", sku: "KNCE05", category: "AUTOMOTIVE", subcategory: "NANOCERAMIC", shade: "05",
    description: "Tecnología Nano Ceramic. 99% bloqueo UV, 95% rechazo IR. VLT 5%.",
    installWarrantyMonths: 120,
  },
  {
    name: "KERAMX 15", sku: "KNCE15", category: "AUTOMOTIVE", subcategory: "NANOCERAMIC", shade: "15",
    description: "Tecnología Nano Ceramic. 99% bloqueo UV, 95% rechazo IR. VLT 15%.",
    installWarrantyMonths: 120,
  },
  {
    name: "KERAMX 35", sku: "KNCE35", category: "AUTOMOTIVE", subcategory: "NANOCERAMIC", shade: "35",
    description: "Tecnología Nano Ceramic. 99% bloqueo UV, 95% rechazo IR. VLT 35%.",
    installWarrantyMonths: 120,
  },
  {
    name: "KERAMX 50", sku: "KNCE50", category: "AUTOMOTIVE", subcategory: "NANOCERAMIC", shade: "50",
    description: "Tecnología Nano Ceramic. 99% bloqueo UV, 95% rechazo IR. VLT 50%.",
    installWarrantyMonths: 120,
  },
  {
    name: "KERAMX 75", sku: "KNCE75", category: "AUTOMOTIVE", subcategory: "NANOCERAMIC", shade: "75",
    description: "Tecnología Nano Ceramic. 99% bloqueo UV, 95% rechazo IR. VLT 75%.",
    installWarrantyMonths: 120,
  },

  // ── KRYPTON — Security Window Film ──────────────────────────────────────────
  {
    name: "KRYPTON 15", sku: "KS4", category: "AUTOMOTIVE", subcategory: "SAFETY", shade: "15",
    description: "Film de seguridad estructural. 99% bloqueo UV, 95% rechazo IR, 100 micrones. Retención de fragmentos en impacto.",
    installWarrantyMonths: 120,
  },

  // ── PPF — Paint Protection Film ─────────────────────────────────────────────
  {
    name: "PPF KRISTALL", sku: "TPUKX", category: "PPF", subcategory: "GLOSS", shade: null,
    description: "Film de poliuretano termoplástico 7.5mil. Transparente. Self-healing por calor. Rollo 1.52m x 15m.",
    installWarrantyMonths: 180,
  },
];

async function main() {
  let created = 0;
  let skipped = 0;
  let warrantyCreated = 0;
  let warrantyUpdated = 0;

  for (const p of products) {
    // Check if product exists before upsert so we can report correctly
    const existing = await prisma.product.findUnique({ where: { sku: p.sku } });

    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        name: p.name,
        sku: p.sku,
        category: p.category,
        subcategory: p.subcategory,
        shade: p.shade,
        brand: "KRISTALL",
        description: p.description,
        price: 0,
        cost: 0,
        stock: 0,
        minStock: 0,
        active: true,
      },
    });

    if (!existing) {
      console.log(`  ✓ Creado:    "${p.name}" (${p.sku})`);
      created++;
    } else {
      console.log(`  ⏭ Ya existe: "${p.name}" (${p.sku})`);
      skipped++;
    }

    // Upsert WarrantyConfig
    const existingWarranty = await prisma.warrantyConfig.findUnique({ where: { productId: product.id } });
    await prisma.warrantyConfig.upsert({
      where: { productId: product.id },
      update: { installWarrantyMonths: p.installWarrantyMonths },
      create: {
        productId: product.id,
        installWarrantyMonths: p.installWarrantyMonths,
      },
    });

    if (!existingWarranty) {
      console.log(`    ↳ WarrantyConfig creado: ${p.installWarrantyMonths} meses`);
      warrantyCreated++;
    } else {
      warrantyUpdated++;
    }
  }

  console.log("\n─────────────────────────────────────────");
  console.log(`Productos creados:       ${created}`);
  console.log(`Productos ya existentes: ${skipped}`);
  console.log(`WarrantyConfigs creados: ${warrantyCreated}`);
  if (warrantyUpdated > 0) {
    console.log(`WarrantyConfigs ya existían (sin cambio de datos): ${warrantyUpdated}`);
  }
  console.log("─────────────────────────────────────────");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
