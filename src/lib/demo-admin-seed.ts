import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { addDays, addMonths, subDays, subMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/demo-admin-seed");

/**
 * Seed del demo del PANEL INTERNO (no confundir con el demo del portal de
 * clientes, que vive en demo-plantilla.ts y usa otra base vía demo-context.ts).
 *
 * Esta función vive en `src/lib` —no en `prisma/`— porque además de correr
 * como script de una sola vez (ver el wrapper en `prisma/seed-demo-admin.ts`),
 * se llama sola al arrancar el servidor del demo, desde `instrumentation.ts`,
 * atrás de `SEED_DEMO_ADMIN_ON_BOOT=true`. Esa variable solo existe en el
 * deploy de demo — en producción esto nunca se importa ni se ejecuta.
 *
 * Usa el `prisma` de siempre (`@/lib/prisma`): en el deploy de demo,
 * `DATABASE_URL` ES la base de demo, así que no hace falta el mecanismo de
 * `demo-context.ts` (eso es para el portal, que corre en el MISMO proceso que
 * producción). Acá todo el proceso habla contra una base separada desde el
 * vamos.
 *
 * Es idempotente a nivel de todo el seed: si ya hay algún `Contact`, asume que
 * ya corrió y no hace nada. Pensado para una base que nace vacía — si hay que
 * resetear el demo, se trunca la base entera y se reinicia la app, no se
 * vuelve a correr sobre una base con datos parciales.
 *
 * Todas las fechas son relativas al momento en que corre, para que el demo
 * nunca se vea desactualizado sin importar cuándo se abra.
 */

const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD || "KristallDemo2026!";

let hoy = new Date();

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

async function crearUsuariosDemo() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const superadmin = await prisma.user.upsert({
    where: { email: "demo-superadmin@kristallfilm.com" },
    update: {},
    create: { name: "Martín (Demo Superadmin)", email: "demo-superadmin@kristallfilm.com", password: hash, role: "SUPERADMIN" },
  });
  const admin = await prisma.user.upsert({
    where: { email: "demo-admin@kristallfilm.com" },
    update: {},
    create: { name: "Lucía (Demo Admin)", email: "demo-admin@kristallfilm.com", password: hash, role: "ADMIN" },
  });
  const operador = await prisma.user.upsert({
    where: { email: "demo-operador@kristallfilm.com" },
    update: {},
    create: { name: "Franco (Demo Operador)", email: "demo-operador@kristallfilm.com", password: hash, role: "OPERATOR" },
  });

  log.info("Usuarios demo listos");
  return { superadmin, admin, operador };
}

async function crearCreditTiers() {
  const TIERS = [
    { code: "A", name: "Escalafón A", limit: 200_000 },
    { code: "B", name: "Escalafón B", limit: 500_000 },
    { code: "C", name: "Escalafón C", limit: 1_000_000 },
    { code: "D", name: "Escalafón D", limit: 2_000_000 },
  ];
  for (const t of TIERS) {
    await prisma.creditTier.upsert({ where: { code: t.code }, update: {}, create: t });
  }
}

async function crearProductos() {
  const DEFS = [
    {
      sku: "KNCE15", name: "KERAMX 15", category: "AUTOMOTIVE" as const, subcategory: "NANOCERAMIC",
      shade: "15", description: "Tecnología Nano Ceramic. 99% bloqueo UV, 95% rechazo IR. VLT 15%.",
      price: 145_000, cost: 90_000, width: 1.52, length: 30, stock: 40, minStock: 10,
      rollMeses: 24, instalacionMeses: 120, abrevCodigo: "AUT",
    },
    {
      sku: "KPRO15", name: "KLAR 15", category: "AUTOMOTIVE" as const, subcategory: "PREMIUM",
      shade: "15", description: "Lámina con acabado consistente. 99% bloqueo UV. VLT 15%.",
      price: 85_000, cost: 52_000, width: 1.52, length: 30, stock: 40, minStock: 10,
      rollMeses: 12, instalacionMeses: 36, abrevCodigo: "AUT",
    },
    {
      sku: "KRF15S", name: "KReflect Silver 15", category: "ARCHITECTURAL" as const, subcategory: "SOLAR",
      shade: "15", description: "Tecnología Arquitectura Espejado. 99% bloqueo UV, 88% rechazo IR. VLT 15%.",
      price: 98_000, cost: 61_000, width: 1.52, length: 30, stock: 25, minStock: 5,
      rollMeses: 24, instalacionMeses: 72, abrevCodigo: "ARQ",
    },
    {
      sku: "TPUKX", name: "PPF KRISTALL", category: "PPF" as const, subcategory: "GLOSS",
      shade: null, description: "Film de poliuretano termoplástico 7.5mil. Transparente. Self-healing por calor.",
      price: 210_000, cost: 140_000, width: 1.52, length: 15, stock: 15, minStock: 5,
      rollMeses: 36, instalacionMeses: 180, abrevCodigo: "PPF",
    },
  ];

  const productos: Record<string, { id: string; abrevCodigo: string; stock: number }> = {};

  for (const d of DEFS) {
    const p = await prisma.product.upsert({
      where: { sku: d.sku },
      update: {},
      create: {
        name: d.name, sku: d.sku, category: d.category, subcategory: d.subcategory, shade: d.shade,
        brand: "KRISTALL", description: d.description, price: d.price, cost: d.cost,
        stock: d.stock, minStock: d.minStock, width: d.width, length: d.length, active: true,
      },
    });
    await prisma.warrantyConfig.upsert({
      where: { productId: p.id },
      update: {},
      create: { productId: p.id, rollWarrantyMonths: d.rollMeses, installWarrantyMonths: d.instalacionMeses },
    });
    await prisma.stockMovement.create({
      data: {
        productId: p.id, type: "ENTRADA", quantity: d.stock, stockBefore: 0, stockAfter: d.stock,
        referenceType: "ADJUSTMENT", reason: "Carga inicial de stock — demo",
      },
    });
    productos[d.sku] = { id: p.id, abrevCodigo: d.abrevCodigo, stock: d.stock };
  }

  return productos;
}

async function crearContactos(operadorId: string) {
  const leads = await Promise.all([
    prisma.contact.create({ data: {
      firstName: "Diego", lastName: "Fernández", type: "LEAD", sector: "AUTO_TALLER",
      phone: "+54 9 261 555 0101", email: "diego.fernandez@example.com", city: "Mendoza",
      contacted: false, contactMethod: "NONE", source: "MANUAL", nextFollowUpAt: addDays(hoy, 1),
      assignedToId: operadorId,
    } }),
    prisma.contact.create({ data: {
      firstName: "Valentina", lastName: "Rojas", type: "LEAD", sector: "ARQUITECTURA_CONSTRUCTORA",
      company: "Constructora Rojas", phone: "+54 9 261 555 0102", email: "valentina.rojas@example.com",
      city: "Mendoza", contacted: true, contactMethod: "WHATSAPP", leadOutcome: "INTERESTED",
      leadOutcomeAt: subDays(hoy, 2), source: "MANUAL", assignedToId: operadorId,
    } }),
    prisma.contact.create({ data: {
      firstName: "Taller", lastName: "Rápido SRL", type: "LEAD", sector: "AUTO_CONCESIONARIO",
      company: "Taller Rápido SRL", phone: "+54 9 261 555 0103", city: "Guaymallén",
      contacted: true, contactMethod: "PHONE", leadOutcome: "CALL_BACK", leadOutcomeAt: subDays(hoy, 1),
      nextFollowUpAt: addDays(hoy, 3), source: "MANUAL", assignedToId: operadorId,
    } }),
    prisma.contact.create({ data: {
      firstName: "Vidrios", lastName: "del Sur", type: "LEAD", sector: "ARQUITECTURA_VIDRIERIA",
      company: "Vidrios del Sur", phone: "+54 9 261 555 0104", city: "Luján de Cuyo",
      contacted: true, contactMethod: "EMAIL", leadOutcome: "NOT_INTERESTED", leadOutcomeAt: subDays(hoy, 10),
      source: "MANUAL", assignedToId: operadorId,
    } }),
    prisma.contact.create({ data: {
      firstName: "Martín", lastName: "Suárez", type: "LEAD", sector: "AUTO_MAYORISTA",
      phone: "+54 9 261 555 0105", city: "Godoy Cruz", contacted: false, contactMethod: "NONE",
      source: "SCRAPPER", assignedToId: operadorId,
    } }),
    prisma.contact.create({ data: {
      firstName: "Construcciones", lastName: "Bellavista", type: "LEAD", sector: "ARQUITECTURA_MAYORISTA",
      company: "Construcciones Bellavista", phone: "+54 9 261 555 0106", city: "Las Heras",
      contacted: true, contactMethod: "PHONE", leadOutcome: "NO_ANSWER", leadOutcomeAt: subDays(hoy, 1),
      nextFollowUpAt: addDays(hoy, 1), source: "MANUAL", assignedToId: operadorId,
    } }),
  ]);

  const clientes = await Promise.all([
    prisma.contact.create({ data: {
      firstName: "Carlos", lastName: "Giménez", type: "CLIENT", sector: "AUTO_TALLER",
      phone: "+54 9 261 555 0201", email: "carlos.gimenez@example.com", city: "Mendoza",
      contacted: true, contactMethod: "PHONE", source: "MANUAL", assignedToId: operadorId,
    } }),
    prisma.contact.create({ data: {
      firstName: "Taller", lastName: "Mendoza Polarizados", type: "CLIENT", sector: "AUTO_TALLER",
      company: "Taller Mendoza Polarizados", phone: "+54 9 261 555 0202", email: "contacto@mendozapolarizados.example.com",
      city: "Mendoza", contacted: true, contactMethod: "WHATSAPP", source: "MANUAL", assignedToId: operadorId,
    } }),
    prisma.contact.create({ data: {
      firstName: "Ana Belén", lastName: "Torres", type: "CLIENT", sector: "ARQUITECTURA_CONSTRUCTORA",
      phone: "+54 9 261 555 0203", email: "anabelen.torres@example.com", city: "Mendoza",
      contacted: true, contactMethod: "EMAIL", source: "MANUAL", assignedToId: operadorId,
    } }),
    prisma.contact.create({ data: {
      firstName: "Vidrios", lastName: "Premium SA", type: "CLIENT", sector: "ARQUITECTURA_VIDRIERIA",
      company: "Vidrios Premium SA", phone: "+54 9 261 555 0204", city: "Mendoza",
      contacted: true, contactMethod: "PHONE", source: "MANUAL", assignedToId: operadorId,
    } }),
  ]);

  const instaladores = await Promise.all([
    prisma.contact.create({ data: {
      firstName: "Taller", lastName: "Luján Films", type: "INSTALLER", company: "Taller Luján Films",
      phone: "+54 9 261 555 0301", city: "Luján de Cuyo", hasLocalStore: true,
      storeAddress: "Av. San Martín 1234, Luján de Cuyo", source: "MANUAL", assignedToId: operadorId,
    } }),
    prisma.contact.create({ data: {
      firstName: "Polarizados", lastName: "del Oeste", type: "INSTALLER", company: "Polarizados del Oeste",
      phone: "+54 9 261 555 0302", city: "Godoy Cruz", source: "MANUAL", assignedToId: operadorId,
    } }),
    prisma.contact.create({ data: {
      firstName: "AutoStyle", lastName: "Rosario", type: "INSTALLER", company: "AutoStyle Rosario",
      phone: "+54 9 341 555 0303", city: "Rosario", source: "MANUAL", assignedToId: operadorId,
    } }),
  ]);

  const revendedor = await prisma.contact.create({ data: {
    firstName: "Distribuidora", lastName: "Norte", type: "RESELLER", company: "Distribuidora Norte",
    phone: "+54 9 387 555 0401", city: "Salta", source: "MANUAL", assignedToId: operadorId,
  } });
  const subcliente = await prisma.contact.create({ data: {
    firstName: "Vidriería", lastName: "San Martín", type: "CLIENT", company: "Vidriería San Martín",
    phone: "+54 9 387 555 0402", city: "Salta", source: "MANUAL", assignedToId: operadorId,
    resellerId: revendedor.id,
  } });

  return { leads, clientes, instaladores, revendedor, subcliente };
}

async function crearActividad(operadorId: string, adminId: string, leads: { id: string }[]) {
  await prisma.visit.create({ data: {
    contactId: leads[1].id, assignedToId: operadorId, createdById: adminId,
    scheduledDate: subDays(hoy, 3), completed: true, completedDate: subDays(hoy, 3),
    result: "Visita a la obra. Interesada en avanzar con un presupuesto.",
  } });
  await prisma.visit.create({ data: {
    contactId: leads[2].id, assignedToId: operadorId, createdById: operadorId,
    scheduledDate: addDays(hoy, 2), completed: false,
    notes: "Llevar muestras de KERAMX y KLAR.",
  } });

  await prisma.call.create({ data: {
    contactId: leads[0].id, assignedToId: operadorId, createdById: operadorId,
    scheduledAt: subDays(hoy, 1), durationMin: 8, completed: true, completedAt: subDays(hoy, 1),
    result: "No atendió, se deja mensaje.",
  } });
  await prisma.call.create({ data: {
    contactId: leads[5].id, assignedToId: adminId, createdById: adminId,
    scheduledAt: addDays(hoy, 1), completed: false,
  } });

  const actividades: Array<[string, "NOTE" | "CALL" | "EMAIL_SENT" | "STATUS_CHANGE" | "VISIT" | "QUOTE_SENT", string, string?]> = [
    [leads[0].id, "NOTE", "Contactado por primera vez a través del scrapper de talleres."],
    [leads[1].id, "VISIT", "Visita a obra realizada", "Buena recepción, pide presupuesto formal."],
    [leads[1].id, "QUOTE_SENT", "Presupuesto enviado"],
    [leads[2].id, "CALL", "Llamado de seguimiento", "Pide que lo llamen la semana que viene."],
    [leads[3].id, "STATUS_CHANGE", "Marcado como no interesado", "Ya tiene proveedor habitual."],
    [leads[5].id, "CALL", "Intento de contacto sin respuesta"],
  ];
  for (const [contactId, type, title, description] of actividades) {
    await prisma.leadActivity.create({ data: { contactId, userId: operadorId, type, title, description } });
  }
}

async function crearPresupuestos(operadorId: string, adminId: string, leads: { id: string }[], productos: Record<string, { id: string }>) {
  const itemsDe = (sku: string, qty: number, unitPrice: number) => ({
    productId: productos[sku].id, quantity: qty, unitPrice, discount: 0, discountType: "FIXED", total: qty * unitPrice,
  });

  await prisma.quote.create({ data: {
    contactId: leads[1].id, userId: operadorId, status: "SENT", subtotal: 196_000, total: 196_000,
    sentAt: subDays(hoy, 2), validUntil: addDays(hoy, 15),
    items: { create: [itemsDe("KRF15S", 2, 98_000)] },
  } });

  await prisma.quote.create({ data: {
    contactId: leads[2].id, userId: adminId, status: "ACCEPTED", subtotal: 85_000, total: 85_000,
    sentAt: subDays(hoy, 5), validUntil: addDays(hoy, 10),
    items: { create: [itemsDe("KPRO15", 1, 85_000)] },
  } });

  await prisma.quote.create({ data: {
    contactId: leads[3].id, userId: operadorId, status: "REJECTED", subtotal: 145_000, total: 145_000,
    sentAt: subDays(hoy, 20), validUntil: subDays(hoy, 5),
    items: { create: [itemsDe("KNCE15", 1, 145_000)] },
  } });
}

let seqUnidad = 0;
let seqRollo = 0;
let seqLote = 0;

async function crearUnidad(productId: string, abrev: string, shade: string | null) {
  seqUnidad += 1;
  return prisma.productUnit.create({ data: {
    productId, code: `${abrev}-${shade ?? "NA"}-${String(seqUnidad).padStart(4, "0")}-DEMO`,
  } });
}

async function crearLote(productId: string, cantidad: number, purchaseOrderId?: string) {
  seqLote += 1;
  return prisma.warrantyLot.create({ data: {
    productId, quantity: cantidad, lotNumber: `LOT-DEMO-${String(seqLote).padStart(4, "0")}`,
    receivedAt: subDays(hoy, 30), purchaseOrderId,
  } });
}

async function crearVentasYGarantias(
  operadorId: string, adminId: string,
  clientes: { id: string }[], productos: Record<string, { id: string; abrevCodigo: string }>
) {
  // ── Venta 1: pagada por completo (Carlos Giménez, KERAMX 15) ──────────────
  const unidad1 = await crearUnidad(productos.KNCE15.id, productos.KNCE15.abrevCodigo, "15");
  const venta1 = await prisma.sale.create({ data: {
    contactId: clientes[0].id, userId: operadorId, type: "REGULAR", status: "DELIVERED",
    subtotal: 145_000, total: 145_000, createdAt: subDays(hoy, 12),
    items: { create: [{ productId: productos.KNCE15.id, quantity: 1, unitPrice: 145_000, total: 145_000, productUnitId: unidad1.id }] },
  } });
  await prisma.stockMovement.create({ data: {
    productId: productos.KNCE15.id, type: "SALIDA", quantity: -1, stockBefore: 40, stockAfter: 39,
    referenceId: venta1.id, referenceType: "SALE", userId: operadorId,
  } });
  await prisma.payment.create({ data: {
    saleId: venta1.id, contactId: clientes[0].id, amount: 145_000, method: "EFECTIVO",
    paidAt: subDays(hoy, 12),
  } });

  const item1 = await prisma.saleItem.findFirstOrThrow({ where: { saleId: venta1.id } });
  const lote1 = await crearLote(productos.KNCE15.id, 10);
  const rollo1 = await prisma.warrantyRoll.create({ data: {
    lotId: lote1.id, productId: productos.KNCE15.id, unitId: unidad1.id, saleItemId: item1.id,
    fullRollCode: `ROLLO-DEMO-${String(++seqRollo).padStart(4, "0")}`, status: "SOLD",
  } });
  await prisma.warrantyInstallation.create({ data: {
    rollId: rollo1.id, installationNumber: 1, installationCode: `${rollo1.fullRollCode}-01`,
    activationToken: randomHex(32), status: "ACTIVE", assetType: "VEHICLE",
    installerName: "Taller propio", clientName: "Carlos Giménez", clientEmail: "carlos.gimenez@example.com",
    vehicleType: "SEDAN", plate: "AB123CD", installedAt: subDays(hoy, 10), activatedAt: subDays(hoy, 9),
    expiresAt: addMonths(subDays(hoy, 10), 120),
  } });

  // ── Venta 2: en cuotas, al día (Taller Mendoza Polarizados, KLAR 15 x3) ───
  const venta2 = await prisma.sale.create({ data: {
    contactId: clientes[1].id, userId: operadorId, type: "REGULAR", status: "DELIVERED",
    subtotal: 255_000, total: 255_000, createdAt: subMonths(hoy, 1),
    items: { create: [{ productId: productos.KPRO15.id, quantity: 3, unitPrice: 85_000, total: 255_000 }] },
  } });
  await prisma.stockMovement.create({ data: {
    productId: productos.KPRO15.id, type: "SALIDA", quantity: -3, stockBefore: 40, stockAfter: 37,
    referenceId: venta2.id, referenceType: "SALE", userId: operadorId,
  } });
  const plan2 = await prisma.paymentPlan.create({ data: {
    saleId: venta2.id, installmentCount: 3, frequency: "MONTHLY", firstDueDate: subMonths(hoy, 1),
    financedTotal: 255_000, createdById: operadorId, createdAt: subMonths(hoy, 1),
  } });
  const cuotas2 = await Promise.all([1, 2, 3].map((n) => prisma.paymentInstallment.create({ data: {
    planId: plan2.id, number: n, dueDate: addMonths(subMonths(hoy, 1), n - 1), amount: 85_000,
  } })));
  const pago2 = await prisma.payment.create({ data: {
    saleId: venta2.id, contactId: clientes[1].id, amount: 85_000, method: "TRANSFERENCIA", paidAt: subMonths(hoy, 1),
  } });
  await prisma.paymentAllocation.create({ data: { paymentId: pago2.id, installmentId: cuotas2[0].id, amount: 85_000 } });

  // ── Venta 3: en cuotas, VENCIDA (Ana Belén Torres, KReflect Silver 15 x2) ─
  const unidad3a = await crearUnidad(productos.KRF15S.id, productos.KRF15S.abrevCodigo, "15");
  const venta3 = await prisma.sale.create({ data: {
    contactId: clientes[2].id, userId: adminId, type: "REGULAR", status: "DELIVERED",
    subtotal: 196_000, total: 196_000, createdAt: subMonths(hoy, 3),
    items: { create: [{ productId: productos.KRF15S.id, quantity: 2, unitPrice: 98_000, total: 196_000, productUnitId: unidad3a.id }] },
  } });
  await prisma.stockMovement.create({ data: {
    productId: productos.KRF15S.id, type: "SALIDA", quantity: -2, stockBefore: 25, stockAfter: 23,
    referenceId: venta3.id, referenceType: "SALE", userId: adminId,
  } });
  await prisma.paymentPlan.create({ data: {
    saleId: venta3.id, installmentCount: 2, frequency: "MONTHLY", firstDueDate: subMonths(hoy, 2),
    financedTotal: 196_000, createdById: adminId, createdAt: subMonths(hoy, 3),
    installments: { create: [1, 2].map((n) => ({ number: n, dueDate: addMonths(subMonths(hoy, 2), n - 1), amount: 98_000 })) },
  } });

  const item3 = await prisma.saleItem.findFirstOrThrow({ where: { saleId: venta3.id } });
  const lote3 = await crearLote(productos.KRF15S.id, 8);
  const rollo3 = await prisma.warrantyRoll.create({ data: {
    lotId: lote3.id, productId: productos.KRF15S.id, unitId: unidad3a.id, saleItemId: item3.id,
    fullRollCode: `ROLLO-DEMO-${String(++seqRollo).padStart(4, "0")}`, status: "SOLD",
    totalM2: 45.6,
  } });
  const instalacion3 = await prisma.warrantyInstallation.create({ data: {
    rollId: rollo3.id, installationNumber: 1, installationCode: `${rollo3.fullRollCode}-01`,
    activationToken: randomHex(32), status: "ACTIVE", assetType: "BUILDING",
    installerName: "Taller Luján Films", clientName: "Ana Belén Torres", clientEmail: "anabelen.torres@example.com",
    siteAddress: "Av. Las Heras 2200, Mendoza", areaM2: 40, paneCount: 12,
    glassType: "DVH", filmSide: "EXTERIOR", buildingUse: "RESIDENTIAL",
    installedAt: subMonths(hoy, 3), activatedAt: subMonths(hoy, 3), expiresAt: addMonths(subMonths(hoy, 3), 72),
  } });
  await prisma.warrantyClaim.create({ data: {
    installationId: instalacion3.id, status: "OPEN", channel: "INTERNAL", issueType: "BURBUJAS",
    description: "El cliente reporta burbujas en el paño del living, aparecieron a las pocas semanas de instalado.",
    reporterName: "Ana Belén Torres", reporterEmail: "anabelen.torres@example.com", reporterPhone: "+54 9 261 555 0203",
    assignedToId: adminId, affectedPanes: 1, createdAt: subDays(hoy, 4),
  } });

  // ── Venta 4: a consignación, pendiente (Vidrios Premium SA, PPF) ─────────
  await prisma.sale.create({ data: {
    contactId: clientes[3].id, userId: adminId, type: "CONSIGNMENT", status: "PENDING",
    subtotal: 210_000, total: 210_000, createdAt: subDays(hoy, 2),
    items: { create: [{ productId: productos.TPUKX.id, quantity: 1, unitPrice: 210_000, total: 210_000 }] },
  } });
  await prisma.stockMovement.create({ data: {
    productId: productos.TPUKX.id, type: "SALIDA", quantity: -1, stockBefore: 15, stockAfter: 14,
    referenceType: "SALE", userId: adminId,
  } });

  return { lote1 };
}

async function crearComprasYProveedor(lote1Id: string, productos: Record<string, { id: string }>) {
  const proveedor = await prisma.supplier.create({ data: {
    name: "Kristall Film Import Co.", country: "China", currency: "USD", leadTimeDays: 45,
    contactName: "Wei Zhang", contactEmail: "sales@kristallimport.example.com",
  } });
  const orden = await prisma.purchaseOrder.create({ data: {
    supplierId: proveedor.id, status: "RECEIVED", orderDate: subDays(hoy, 45), expectedDate: subDays(hoy, 32),
    receivedDate: subDays(hoy, 30), currency: "USD", exchangeRate: 1050,
    items: { create: [
      { productId: productos.KNCE15.id, quantity: 50, costFOB: 180 },
      { productId: productos.KPRO15.id, quantity: 50, costFOB: 95 },
    ] },
  } });
  await prisma.warrantyLot.update({ where: { id: lote1Id }, data: { purchaseOrderId: orden.id } });
}

async function crearTareas(
  superadminId: string, adminId: string, operadorId: string,
  leads: { id: string }[], clientes: { id: string }[]
) {
  await prisma.crmTask.create({ data: {
    title: "Llamar a Diego Fernández (Taller)", dueDate: addDays(hoy, 1), priority: "HIGH",
    userId: operadorId, contactId: leads[0].id,
  } });
  await prisma.crmTask.create({ data: {
    title: "Enviar presupuesto a Valentina Rojas", dueDate: addDays(hoy, 2), priority: "MEDIUM",
    userId: adminId, assignedById: superadminId, contactId: leads[1].id,
  } });
  await prisma.crmTask.create({ data: {
    title: "Seguimiento cuota vencida — Ana Belén Torres", dueDate: hoy, priority: "HIGH",
    userId: adminId, contactId: clientes[2].id,
  } });
  await prisma.crmTask.create({ data: {
    title: "Confirmar recepción de PO #1 con proveedor", done: true, doneAt: subDays(hoy, 29),
    userId: operadorId,
  } });
  await prisma.crmTask.create({ data: {
    title: "Revisar reclamo de garantía abierto — Ana Belén Torres", dueDate: addDays(hoy, 1),
    priority: "MEDIUM", userId: superadminId, contactId: clientes[2].id,
  } });
}

/**
 * Corre el seed del demo del panel interno si todavía no corrió.
 *
 * No desconecta `prisma` al terminar: a diferencia de un script de línea de
 * comandos, cuando esto se llama desde `instrumentation.ts` el proceso sigue
 * vivo y el resto de la app sigue necesitando esa conexión. El wrapper de CLI
 * (`prisma/seed-demo-admin.ts`) es el que desconecta, porque ahí sí es el
 * final del proceso.
 */
export async function seedDemoAdmin(): Promise<void> {
  const yaHayDatos = await prisma.contact.count();
  if (yaHayDatos > 0) {
    log.info("La base de demo ya tiene contactos — no se vuelve a seedear.");
    return;
  }

  hoy = new Date();
  log.info("Seed del demo del panel interno — empezando...");

  const { superadmin, admin, operador } = await crearUsuariosDemo();
  await crearCreditTiers();
  const productos = await crearProductos();
  const { leads, clientes, instaladores, revendedor, subcliente } = await crearContactos(operador.id);

  await crearActividad(operador.id, admin.id, leads);
  await crearPresupuestos(operador.id, admin.id, leads, productos);
  const { lote1 } = await crearVentasYGarantias(operador.id, admin.id, clientes, productos);
  await crearComprasYProveedor(lote1.id, productos);
  await crearTareas(superadmin.id, admin.id, operador.id, leads, clientes);

  log.info(
    { leads: leads.length, clientes: clientes.length, instaladores: instaladores.length,
      revendedor: revendedor.company, subcliente: subcliente.company },
    "Seed del demo del panel interno — listo"
  );
}

let arrancado = false;

/**
 * Dispara `seedDemoAdmin()` si todavía no se disparó en este proceso.
 *
 * A propósito NO se llama desde `instrumentation.ts`: ese archivo corre antes
 * del primer request y abrir ahí una conexión a base ya tumbó este mismo CRM
 * una vez (ver el comentario en `register()`). En cambio, esto se llama sin
 * esperar (`void`) desde `proxy.ts` en cada request — igual que
 * `asegurarLimpiezaArrancada()` del portal de demo— así que el seed arranca
 * solo con el primer request real, no con el arranque del proceso.
 *
 * Idempotente y barato: llamalo sin miedo en cada request.
 */
export function asegurarSeedDemoAdmin(): void {
  if (arrancado) return;
  arrancado = true;
  seedDemoAdmin().catch((err) => log.error({ err }, "Falló el seed de demo al arrancar"));
}
