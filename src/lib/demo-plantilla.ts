import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { exigirDemo } from "@/lib/demo-context";
import { credentialVersion } from "@/lib/portal-credentials";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/demo-plantilla");

/**
 * El taller descartable que ve cada persona que entra a la demostración.
 *
 * ─── Un clon por sesión, no un reseteo ─────────────────────────────────────
 *
 * La idea original era una cuenta `demo` que se restableciera al entrar. Se
 * rompe con dos visitantes simultáneos, que es justo cuando se usa un demo: un
 * vendedor mostrándolo en una reunión mientras alguien más entró por el link
 * del mail. El segundo login le borraría el taller al primero a mitad del
 * recorrido.
 *
 * Con un clon por sesión el reseteo deja de existir como problema: cada sesión
 * nace limpia por construcción y lo viejo lo junta el cron.
 *
 * ─── Cómo se reconoce un clon ──────────────────────────────────────────────
 *
 * No hace falta marcarlo. **En la base de demo, todo `Contact` es un clon** —
 * ahí no vive ningún dato real. Eso hace que la limpieza sea "borrar los
 * contactos viejos" sin ninguna columna nueva ni ningún filtro que alguien
 * pueda olvidarse. Es una ventaja que sale gratis de haber separado las bases.
 *
 * ─── Las fechas son relativas a hoy ────────────────────────────────────────
 *
 * Y no es cosmética. Un demo donde todo dice "vencido hace ocho meses" y la
 * última orden es de enero se ve abandonado, y esa impresión se le pega al
 * producto. Órdenes de esta semana, garantías que vencen el año que viene,
 * turnos para el jueves.
 */

/** El catálogo compartido: productos y el operador que "vendió" los rollos. */
const MAIL_OPERADOR = "operador@demo.local";

const PRODUCTOS = [
  {
    sku: "DEMO-AUTO-35",
    name: "Kristall Nano Cerámica 35",
    category: "AUTOMOTIVE" as const,
    price: 145000,
    width: 1.52,
    length: 30,
    meses: 60,
  },
  {
    sku: "DEMO-ARQ-SOLAR",
    name: "Kristall Control Solar Plata 20",
    category: "ARCHITECTURAL" as const,
    price: 98000,
    width: 1.52,
    length: 30,
    meses: 120,
  },
];

function dias(n: number): Date {
  return new Date(Date.now() + n * 86_400_000);
}

/** Un día hábil a una hora redonda, para que la agenda se vea prolija. */
function aLasHoras(fecha: Date, hora: number): Date {
  const d = new Date(fecha);
  d.setHours(hora, 0, 0, 0);
  return d;
}

/**
 * Deja listos los productos y el operador que comparten todos los clones.
 *
 * Es idempotente: se puede llamar en cada provisión sin duplicar nada. Vive
 * aparte del clon porque un `Product` no cuelga de un contacto, así que si cada
 * sesión creara los suyos la base se llenaría de catálogos huérfanos que la
 * limpieza no sabría borrar.
 */
async function asegurarCatalogo(): Promise<{
  userId: string;
  // `sku` es nullable en Product: la columna es opcional para el catalogo real.
  productos: { id: string; sku: string | null }[];
}> {
  exigirDemo("asegurarCatalogo()");

  const user = await prisma.user.upsert({
    where: { email: MAIL_OPERADOR },
    create: {
      email: MAIL_OPERADOR,
      name: "Equipo Kristall",
      // Hash de una contraseña aleatoria que nadie conoce: esta cuenta existe
      // para que las ventas de demostración tengan un vendedor, no para entrar.
      password: await hash(randomBytes(32).toString("hex"), 10),
      role: "ADMIN",
    },
    update: {},
    select: { id: true },
  });

  const productos = [];
  for (const p of PRODUCTOS) {
    const producto = await prisma.product.upsert({
      where: { sku: p.sku },
      create: {
        sku: p.sku,
        name: p.name,
        category: p.category,
        price: p.price,
        width: p.width,
        length: p.length,
        warrantyConfig: {
          create: { installWarrantyMonths: p.meses, maxInstallations: 15 },
        },
      },
      update: {},
      select: { id: true, sku: true },
    });
    productos.push(producto);
  }

  return { userId: user.id, productos };
}

export interface ClonDemo {
  contactId: string;
  /** Huella de la credencial, para que la sesión pase el portero del CRM. */
  credentialVersion: string;
  nombre: string;
}

/**
 * Crea un taller de demostración nuevo y devuelve con qué abrirle sesión.
 *
 * La cuenta de portal lleva un hash de una contraseña aleatoria de 32 bytes que
 * nadie conoce: existe porque `requireInstallerLevel` exige que exista, y no se
 * puede entrar con ella ni por el formulario de login ni adivinándola. La puerta
 * es este endpoint, no una credencial.
 */
export async function provisionarClonDemo(): Promise<ClonDemo> {
  exigirDemo("provisionarClonDemo()");

  const { userId, productos } = await asegurarCatalogo();
  const auto = productos.find((p) => p.sku === "DEMO-AUTO-35")!;
  const arq = productos.find((p) => p.sku === "DEMO-ARQ-SOLAR")!;

  const marca = randomBytes(4).toString("hex");
  const clave = randomBytes(32).toString("hex");
  const claveHash = await hash(clave, 10);

  const contacto = await prisma.contact.create({
    data: {
      type: "CLIENT",
      firstName: "Taller",
      lastName: "de Demostración",
      company: "Polarizados del Sur",
      email: `demo-${marca}@demo.local`,
      phone: "1145678900",
      city: "Buenos Aires",
      portalAccount: {
        create: {
          email: `demo-${marca}@demo.local`,
          passwordHash: claveHash,
          enabled: true,
          accessLevel: "INSTALLER",
          activatedAt: new Date(),
        },
      },
      workshopSettings: {
        create: {
          workshopName: "Polarizados del Sur",
          // Sin handle y sin publicar: elegirlo y publicar es uno de los pasos
          // del recorrido, y es el que más convence. Dárselo hecho sería
          // sacarle al prospecto la parte que lo engancha.
          handle: null,
          publicPageEnabled: false,
          publicAddress: "Av. Rivadavia 4820, CABA",
          publicLat: -34.6187,
          publicLng: -58.4306,
          publicPhone: "1145678900",
          publicEmail: "hola@polarizadosdelsur.demo",
          doesAutomotive: true,
          doesArchitectural: true,
          worksAtShop: true,
          worksOnSite: true,
          worksForDealers: false,
          openingTime: "09:00",
          closingTime: "18:00",
          workingDays: "1,2,3,4,5",
          nextOrderNumber: 6,
        },
      },
      workshopServices: {
        create: [
          {
            name: "Polarizado completo",
            description: "Cuatro puertas, luneta y parabrisas",
            priceFrom: 145000,
            durationMinutes: 120,
            sortOrder: 0,
          },
          {
            name: "Polarizado de parabrisas",
            description: "Lámina de alta visibilidad, homologada",
            priceFrom: 62000,
            durationMinutes: 60,
            sortOrder: 1,
          },
          {
            name: "Control solar en vidrios",
            description: "Ventanas y ventanales, por dentro o por fuera",
            category: "ARCHITECTURAL",
            priceFrom: 18000,
            durationMinutes: 60,
            sortOrder: 2,
          },
          {
            name: "Lámina de seguridad",
            description: "Para locales, oficinas y planta baja",
            category: "ARCHITECTURAL",
            durationMinutes: 60,
            sortOrder: 3,
          },
        ],
      },
    },
    select: { id: true, company: true },
  });

  const contactId = contacto.id;

  // ── Clientes finales con sus vehículos ───────────────────────────────────
  const clientes = await Promise.all(
    [
      { name: "Martín Elizalde", phone: "1156781234", email: "martin@ejemplo.demo", patente: "AB123CD", tipo: "SUV" },
      { name: "Carla Ferrari", phone: "1167892345", email: "carla@ejemplo.demo", patente: "AC456DE", tipo: "SEDAN" },
      { name: "Estudio Vega", phone: "1178903456", email: "admin@estudiovega.demo", patente: null, tipo: null },
    ].map(async (c) =>
      prisma.workshopClient.create({
        data: {
          contactId,
          name: c.name,
          phone: c.phone,
          email: c.email,
          assets: c.patente
            ? { create: [{ type: "VEHICLE", identifier: c.patente, notes: `Tipo: ${c.tipo}` }] }
            : { create: [{ type: "BUILDING", identifier: "Av. Rivadavia 4820, piso 3", notes: "Oficina · 14 vidrios" }] },
        },
        select: { id: true, assets: { select: { id: true } } },
      })
    )
  );

  // ── Stock: una compra con dos rollos, uno a medio usar ───────────────────
  const venta = await prisma.sale.create({
    data: {
      contactId,
      userId,
      subtotal: 243000,
      total: 243000,
      status: "DELIVERED",
      createdAt: dias(-42),
      items: {
        create: [
          { productId: auto.id, quantity: 1, unitPrice: 145000, total: 145000 },
          { productId: arq.id, quantity: 1, unitPrice: 98000, total: 98000 },
        ],
      },
    },
    select: { id: true, items: { select: { id: true, productId: true } } },
  });

  const lote = await prisma.warrantyLot.create({
    data: { productId: auto.id, lotNumber: `DEMO-${marca}`, quantity: 2, receivedAt: dias(-50) },
    select: { id: true },
  });

  const itemAuto = venta.items.find((i) => i.productId === auto.id)!;
  const itemArq = venta.items.find((i) => i.productId === arq.id)!;

  const rolloAuto = await prisma.warrantyRoll.create({
    data: {
      lotId: lote.id,
      productId: auto.id,
      saleItemId: itemAuto.id,
      fullRollCode: `DEMO-${marca}-R001`,
      status: "IN_USE",
    },
    select: { id: true },
  });
  await prisma.warrantyRoll.create({
    data: {
      lotId: lote.id,
      productId: arq.id,
      saleItemId: itemArq.id,
      fullRollCode: `DEMO-${marca}-R002`,
      status: "SOLD",
    },
  });

  // Una garantía activa y otra sin activar: el prospecto tiene que ver los dos
  // estados, porque la diferencia entre generar el código y que el cliente lo
  // active es lo que más cuesta explicar por teléfono.
  const instalada = await prisma.warrantyInstallation.create({
    data: {
      rollId: rolloAuto.id,
      installationNumber: 1,
      installationCode: `DEMO-${marca}-R001-I1`,
      activationToken: randomBytes(32).toString("hex"),
      status: "ACTIVE",
      assetType: "VEHICLE",
      vehicleType: "SUV",
      plate: "AB123CD",
      clientName: "Martín Elizalde",
      clientEmail: "martin@ejemplo.demo",
      installerName: "Polarizados del Sur",
      installedAt: dias(-12),
      activatedAt: dias(-11),
      expiresAt: dias(365 * 5 - 11),
    },
    select: { id: true },
  });
  await prisma.warrantyInstallation.create({
    data: {
      rollId: rolloAuto.id,
      installationNumber: 2,
      installationCode: `DEMO-${marca}-R001-I2`,
      activationToken: randomBytes(32).toString("hex"),
      status: "PENDING",
      assetType: "VEHICLE",
      vehicleType: "SEDAN",
      plate: "AC456DE",
      clientName: "Carla Ferrari",
      clientEmail: "carla@ejemplo.demo",
      installerName: "Polarizados del Sur",
    },
  });

  // ── Órdenes en los cinco estados ─────────────────────────────────────────
  const ordenes: {
    n: number;
    cliente: number;
    estado: "PRESUPUESTADA" | "AGENDADA" | "EN_PROCESO" | "TERMINADA" | "ENTREGADA";
    cuando: Date;
    precio: number;
    desc: string;
    m2?: number;
  }[] = [
    { n: 1, cliente: 0, estado: "ENTREGADA", cuando: aLasHoras(dias(-12), 9), precio: 145000, desc: "Polarizado completo", m2: 4.2 },
    { n: 2, cliente: 1, estado: "TERMINADA", cuando: aLasHoras(dias(-3), 14), precio: 62000, desc: "Polarizado de parabrisas", m2: 1.6 },
    { n: 3, cliente: 2, estado: "EN_PROCESO", cuando: aLasHoras(dias(0), 10), precio: 210000, desc: "Control solar en vidrios", m2: 12 },
    { n: 4, cliente: 0, estado: "AGENDADA", cuando: aLasHoras(dias(2), 11), precio: 62000, desc: "Polarizado de parabrisas" },
    { n: 5, cliente: 1, estado: "PRESUPUESTADA", cuando: aLasHoras(dias(5), 15), precio: 98000, desc: "Lámina de seguridad" },
  ];

  for (const o of ordenes) {
    const c = clientes[o.cliente];
    await prisma.workOrder.create({
      data: {
        contactId,
        orderNumber: o.n,
        workshopClientId: c.id,
        assetId: c.assets[0]?.id ?? null,
        status: o.estado,
        scheduledAt: o.cuando,
        startedAt: ["EN_PROCESO", "TERMINADA", "ENTREGADA"].includes(o.estado) ? o.cuando : null,
        finishedAt: ["TERMINADA", "ENTREGADA"].includes(o.estado) ? o.cuando : null,
        deliveredAt: o.estado === "ENTREGADA" ? o.cuando : null,
        priceQuoted: o.precio,
        priceFinal: ["TERMINADA", "ENTREGADA"].includes(o.estado) ? o.precio : null,
        warrantyInstallationId: o.estado === "ENTREGADA" ? instalada.id : null,
        items: {
          create: [
            {
              description: o.desc,
              productId: o.desc.includes("solar") || o.desc.includes("seguridad") ? arq.id : auto.id,
              rollId: o.m2 ? rolloAuto.id : null,
              squareMetersUsed: o.m2 ?? null,
              price: o.precio,
            },
          ],
        },
        payments: ["TERMINADA", "ENTREGADA"].includes(o.estado)
          ? { create: [{ amount: o.precio, method: "EFECTIVO", paidAt: o.cuando }] }
          : undefined,
      },
    });
  }

  // ── Dos pedidos de turno esperando respuesta ─────────────────────────────
  // Sin esto la bandeja arranca vacía y el paso del recorrido que más se luce
  // —confirmar un turno y verlo convertirse en orden— no tiene qué confirmar.
  await prisma.workshopBooking.createMany({
    data: [
      {
        contactId,
        serviceName: "Polarizado completo",
        durationMinutes: 120,
        category: "AUTOMOTIVE",
        clientName: "Sofía Ledesma",
        clientEmail: "sofia@ejemplo.demo",
        clientPhone: "1134567890",
        vehicleType: "HATCHBACK",
        plate: "AD789FG",
        alreadyTinted: false,
        preferredAt: aLasHoras(dias(3), 10),
        cancelToken: randomBytes(24).toString("hex"),
        createdAt: dias(-1),
      },
      {
        contactId,
        serviceName: "Control solar en vidrios",
        durationMinutes: 60,
        category: "ARCHITECTURAL",
        clientName: "Consorcio Güemes 1240",
        clientEmail: "admin@guemes1240.demo",
        clientPhone: "1145678901",
        propertyType: "EDIFICIO",
        siteAddress: "Güemes 1240, CABA",
        glassCount: 34,
        goal: "CONTROL_SOLAR",
        timeWindow: "MANANA",
        preferredAt: aLasHoras(dias(4), 9),
        cancelToken: randomBytes(24).toString("hex"),
        createdAt: dias(-1),
      },
    ],
  });

  log.info({ contactId }, "Clon de demostración provisionado");

  return {
    contactId,
    // La huella de la credencial, no el hash: es lo que kristall-web guarda en
    // la cookie y le manda al CRM en cada llamada. Sin esto, el portero
    // (`credentialVersionMatches`) rechazaria la sesion.
    credentialVersion: credentialVersion(claveHash),
    nombre: contacto.company ?? "Taller de Demostración",
  };
}

/**
 * Cuántos clones vivos se toleran a la vez.
 *
 * No es una restricción de recursos —40 clones son unas 1200 filas— sino un
 * freno por si alguien automatiza la puerta. Pasado el tope el endpoint dice
 * que la demo está ocupada, que es mejor que seguir creando para siempre.
 */
export const MAX_CLONES_VIVOS = 50;

/** Cuántas horas vive un clon antes de que el cron lo junte. */
export const HORAS_DE_VIDA = 24;

export async function clonesVivos(): Promise<number> {
  exigirDemo("clonesVivos()");
  return prisma.contact.count();
}

/**
 * Borra los clones viejos.
 *
 * **Todo `Contact` de la base de demo es un clon**, así que no hace falta
 * marcarlos ni filtrarlos: alcanza con la antigüedad. Eso sale gratis de haber
 * separado las bases, y es lo que hace que este borrado no pueda equivocarse de
 * fila.
 *
 * Aun así lo primero que hace es `exigirDemo()`. Un borrado masivo corriendo
 * por accidente contra producción es exactamente la clase de error que no se
 * puede permitir descubrir después.
 *
 * El orden respeta las dependencias, igual que el borrado de contactos del CRM.
 * Devuelve cuántos clones se llevó.
 */
export async function borrarClonesViejos(horas = HORAS_DE_VIDA): Promise<number> {
  exigirDemo("borrarClonesViejos()");

  const limite = new Date(Date.now() - horas * 3600_000);
  const viejos = await prisma.contact.findMany({
    where: { createdAt: { lt: limite } },
    select: { id: true },
  });
  if (viejos.length === 0) return 0;

  const ids = viejos.map((c) => c.id);

  // Las garantías cuelgan de los rollos, y los rollos de las ventas del clon.
  const rollos = await prisma.warrantyRoll.findMany({
    where: { saleItem: { sale: { contactId: { in: ids } } } },
    select: { id: true, lotId: true },
  });
  const rolloIds = rollos.map((r) => r.id);
  const loteIds = [...new Set(rollos.map((r) => r.lotId))];

  await prisma.warrantyClaim.deleteMany({ where: { installation: { rollId: { in: rolloIds } } } });
  await prisma.workOrderPayment.deleteMany({ where: { workOrder: { contactId: { in: ids } } } });
  await prisma.workOrderItem.deleteMany({ where: { workOrder: { contactId: { in: ids } } } });
  await prisma.workshopBooking.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.workOrder.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.warrantyInstallation.deleteMany({ where: { rollId: { in: rolloIds } } });
  await prisma.warrantyRoll.deleteMany({ where: { id: { in: rolloIds } } });
  await prisma.warrantyLot.deleteMany({ where: { id: { in: loteIds } } });
  await prisma.workshopAsset.deleteMany({ where: { workshopClient: { contactId: { in: ids } } } });
  await prisma.workshopClient.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.workshopService.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.workshopSettings.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.saleItem.deleteMany({ where: { sale: { contactId: { in: ids } } } });
  await prisma.payment.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.sale.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.whatsAppMessage.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.portalNotification.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.portalAccessToken.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.clientPortalAccount.deleteMany({ where: { contactId: { in: ids } } });
  await prisma.contact.deleteMany({ where: { id: { in: ids } } });

  log.info({ cuantos: ids.length, horas }, "Clones de demostración borrados");
  return ids.length;
}
