import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

function resolvePassword(envVar: string, label: string): string {
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;
  const generated = crypto.randomBytes(16).toString("base64url");
  console.warn(
    `⚠️  ${label}: No se encontró ${envVar}, se generó una contraseña aleatoria.`
  );
  console.warn(`   Contraseña generada: ${generated}`);
  console.warn(`   Guárdala en un lugar seguro. No se mostrará de nuevo.\n`);
  return generated;
}

async function main() {
  const adminPass = resolvePassword("SEED_ADMIN_PASSWORD", "Admin");
  const operatorPass = resolvePassword("SEED_OPERATOR_PASSWORD", "Operador");

  // Create admin user
  const adminHash = await bcrypt.hash(adminPass, 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@polarizados.com" },
    update: {},
    create: {
      name: "Administrador",
      email: "admin@polarizados.com",
      password: adminHash,
      role: "ADMIN",
    },
  });

  // Create operator user
  const operatorHash = await bcrypt.hash(operatorPass, 12);
  const operator = await prisma.user.upsert({
    where: { email: "operador@polarizados.com" },
    update: {},
    create: {
      name: "Operador",
      email: "operador@polarizados.com",
      password: operatorHash,
      role: "OPERATOR",
    },
  });

  // Create sample products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Lámina Automotriz 5% Negro",
        category: "AUTOMOTIVE",
        brand: "SunTek",
        width: 1.52,
        length: 30,
        shade: "5%",
        price: 150.0,
        cost: 80.0,
        stock: 25,
        minStock: 5,
        sku: "AUT-ST-5-152",
      },
    }),
    prisma.product.create({
      data: {
        name: "Lámina Automotriz 20% Negro",
        category: "AUTOMOTIVE",
        brand: "SunTek",
        width: 1.52,
        length: 30,
        shade: "20%",
        price: 145.0,
        cost: 78.0,
        stock: 30,
        minStock: 5,
        sku: "AUT-ST-20-152",
      },
    }),
    prisma.product.create({
      data: {
        name: "Lámina Automotriz 35% Negro",
        category: "AUTOMOTIVE",
        brand: "SunTek",
        width: 1.52,
        length: 30,
        shade: "35%",
        price: 140.0,
        cost: 75.0,
        stock: 20,
        minStock: 5,
        sku: "AUT-ST-35-152",
      },
    }),
    prisma.product.create({
      data: {
        name: "Lámina Arquitectónica Silver 20",
        category: "ARCHITECTURAL",
        brand: "3M",
        width: 1.83,
        length: 30,
        shade: "20%",
        price: 280.0,
        cost: 150.0,
        stock: 10,
        minStock: 3,
        sku: "ARQ-3M-S20-183",
      },
    }),
    prisma.product.create({
      data: {
        name: "Lámina Arquitectónica Bronce 35",
        category: "ARCHITECTURAL",
        brand: "3M",
        width: 1.83,
        length: 30,
        shade: "35%",
        price: 260.0,
        cost: 140.0,
        stock: 8,
        minStock: 3,
        sku: "ARQ-3M-B35-183",
      },
    }),
    prisma.product.create({
      data: {
        name: "PPF Clear Protection",
        category: "PPF",
        brand: "XPEL",
        width: 1.52,
        length: 15,
        shade: "Clear",
        price: 450.0,
        cost: 250.0,
        stock: 5,
        minStock: 2,
        sku: "PPF-XP-CLR-152",
      },
    }),
    prisma.product.create({
      data: {
        name: "PPF Matte Protection",
        category: "PPF",
        brand: "XPEL",
        width: 1.52,
        length: 15,
        shade: "Matte",
        price: 520.0,
        cost: 290.0,
        stock: 3,
        minStock: 2,
        sku: "PPF-XP-MAT-152",
      },
    }),
  ]);

  // Create sample leads
  const lead1 = await prisma.contact.create({
    data: {
      type: "LEAD",
      firstName: "Carlos",
      lastName: "Méndez",
      company: "AutoGlass Montevideo",
      email: "carlos@autoglass.com.uy",
      phone: "+598 99 123 456",
      whatsapp: "+598 99 123 456",
      city: "Montevideo",
      state: "Montevideo",
      assignedToId: operator.id,
      contacted: true,
      contactMethod: "WHATSAPP",
      contactDate: new Date(),
      vehicleFlowWeekly: 15,
      currentSupplier: "PolariUY",
      currentSupplierPrices: JSON.stringify({
        "Lámina 5%": 180,
        "Lámina 20%": 170,
        "Lámina 35%": 165,
      }),
    },
  });

  const lead2 = await prisma.contact.create({
    data: {
      type: "LEAD",
      firstName: "María",
      lastName: "González",
      company: "Arquitectura Solar",
      email: "maria@arqsolar.com.uy",
      phone: "+598 99 789 012",
      city: "Punta del Este",
      state: "Maldonado",
      assignedToId: admin.id,
      contacted: false,
      architecturalFlowMonthly: 8,
    },
  });

  // Create a sample client
  const client1 = await prisma.contact.create({
    data: {
      type: "CLIENT",
      firstName: "Roberto",
      lastName: "Silva",
      company: "Polarizados del Sur",
      email: "roberto@polsur.com.uy",
      phone: "+598 99 456 789",
      whatsapp: "+598 99 456 789",
      city: "Montevideo",
      state: "Montevideo",
      assignedToId: admin.id,
      contacted: true,
      contactMethod: "PHONE",
      contactDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      vehicleFlowWeekly: 25,
    },
  });

  // Create sample sale for existing client
  const sale = await prisma.sale.create({
    data: {
      contactId: client1.id,
      userId: admin.id,
      type: "REGULAR",
      status: "DELIVERED",
      subtotal: 1450.0,
      discount: 50.0,
      tax: 0,
      total: 1400.0,
      items: {
        create: [
          {
            productId: products[0].id,
            quantity: 5,
            unitPrice: 150.0,
            total: 750.0,
          },
          {
            productId: products[1].id,
            quantity: 5,
            unitPrice: 140.0,
            total: 700.0,
          },
        ],
      },
    },
  });

  // Create remito for the sale
  await prisma.remito.create({
    data: {
      saleId: sale.id,
    },
  });

  // Create partial payment
  await prisma.payment.create({
    data: {
      saleId: sale.id,
      contactId: client1.id,
      amount: 800.0,
      method: "transfer",
      reference: "TRF-001",
      paidAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    },
  });

  // Create a competitor
  await prisma.competitor.create({
    data: {
      name: "PolariUY",
      website: "https://polariuy.com.uy",
      phone: "+598 2 900 1234",
      notes: "Principal competidor en el mercado automotriz de Montevideo",
      products: {
        create: [
          {
            name: "Lámina Estándar 5%",
            category: "AUTOMOTIVE",
            brand: "Marca Propia",
            shade: "5%",
            price: 180.0,
            notes: "Calidad media, importación China",
          },
          {
            name: "Lámina Estándar 20%",
            category: "AUTOMOTIVE",
            brand: "Marca Propia",
            shade: "20%",
            price: 170.0,
          },
          {
            name: "Lámina Arquitectónica Básica",
            category: "ARCHITECTURAL",
            brand: "Genérica",
            shade: "20%",
            price: 220.0,
            notes: "Sin garantía extendida",
          },
        ],
      },
    },
  });

  // Create a visit
  await prisma.visit.create({
    data: {
      contactId: lead1.id,
      assignedToId: operator.id,
      createdById: admin.id,
      scheduledDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      notes: "Visitar local para evaluar volumen de trabajo y presentar catálogo",
    },
  });

  console.log("Seed completed successfully!");
  console.log("Admin: admin@polarizados.com");
  console.log("Operator: operador@polarizados.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
