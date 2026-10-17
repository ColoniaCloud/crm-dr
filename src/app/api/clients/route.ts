import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logOperatorAction, notifyAdmins, escapeHtml } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
import { resolveResellerId, RESELLER_SUMMARY_SELECT } from "@/lib/subclients";
const log = createLogger("api/clients");

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const city = searchParams.get("city");
    const state = searchParams.get("state");
    const sector = searchParams.get("sector");
    const tagId = searchParams.get("tagId");
    const hasAddress = searchParams.get("hasAddress");
    const withBalance = searchParams.get("withBalance");
    const myClients = searchParams.get("myClients");
    // "none" = clientes directos de Kristall; un id = subclientes de ese revendedor.
    const resellerFilter = searchParams.get("resellerId");
    const sortDate = searchParams.get("sortDate");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limitParam = searchParams.get("limit");
    const isAll = limitParam === "all";
    const limit = isAll
      ? undefined
      : Math.min(100, Math.max(1, parseInt(limitParam || "30", 10)));

    const where: Prisma.ContactWhereInput = { type: "CLIENT" as const };

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { company: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }
    if (city) where.city = { contains: city };
    if (state) where.state = state;
    if (sector) where.sector = sector;
    if (tagId) {
      where.tags = {
        some: {
          tag: { id: tagId }
        }
      };
    }
    if (hasAddress === "1") where.address = { not: null };
    if (resellerFilter === "none") where.resellerId = null;
    else if (resellerFilter === "any") where.resellerId = { not: null };
    else if (resellerFilter) where.resellerId = resellerFilter;
    if (myClients === "1" && session?.user?.id) {
      where.assignedToId = session.user.id;
    }

    // El filtro de balance se aplica después de obtener los datos, ya que depende de los pagos y ventas
    const validSort: "asc" | "desc" = sortDate === "asc" ? "asc" : "desc";
    const orderBy = { createdAt: validSort };

    const minimal = searchParams.get("minimal") === "true";
    if (minimal) {
      const clients = await prisma.contact.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          cuit: true,
          type: true,
          // El formulario de venta muestra el descuento de la etiqueta mientras
          // se arma el carrito, y toma los contactos de este listado.
          discountTag: { select: { id: true, code: true, name: true, type: true, value: true, active: true } },
        },
        orderBy,
        skip: isAll ? undefined : (page - 1) * (limit ?? 30),
        take: isAll ? undefined : limit,
      });
      return NextResponse.json({ clients });
    }

    const [clients, total, distinctStates] = await Promise.all([
      prisma.contact.findMany({
        where,
        take: isAll ? undefined : limit,
        skip: isAll ? undefined : (page - 1) * (limit ?? 30),
        include: {
          assignedTo: {
            select: { id: true, name: true },
          },
          reseller: { select: RESELLER_SUMMARY_SELECT },
          sales: { select: { total: true } },
          payments: { select: { amount: true } },
          tags: {
            include: { tag: true },
          },
        },
        orderBy,
      }),
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where: { type: "CLIENT" as const, state: { not: null } },
        select: { state: true },
        distinct: ["state"],
        orderBy: { state: "asc" },
      }),
    ]);

    const distinctCities = state
      ? await prisma.contact.findMany({
          where: { type: "CLIENT" as const, state, city: { not: null } },
          select: { city: true },
          distinct: ["city"],
          orderBy: { city: "asc" },
        })
      : [];

    let result = clients.map(({ sales, payments, ...c }) => {
      const totalPurchases = sales.reduce((sum, s) => sum + Number(s.total), 0);
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      return {
        ...c,
        totalPurchases,
        balance: totalPurchases - totalPaid,
      };
    });

    if (withBalance === "1") {
      result = result.filter((c) => (c.balance ?? 0) > 0);
    }

    return NextResponse.json({
      clients: result,
      total,
      page,
      totalPages: Math.ceil(total / (limit ?? 30)),
      states: distinctStates.map((s) => s.state).filter(Boolean),
      cities: distinctCities.map((c) => c.city).filter(Boolean),
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching clients");
    return NextResponse.json(
      { error: "Error fetching clients" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const { resellerId: rawResellerId, ...body } = await request.json();

    // Subcliente: el alta puede venir con el revendedor al que pertenece (desde
    // el formulario de Clientes o desde "Crear subcliente" en la ficha del
    // revendedor). Es un cliente normal; solo queda asignado.
    const reseller = await resolveResellerId(rawResellerId);
    if (!reseller.ok) return NextResponse.json({ error: reseller.error }, { status: 400 });

    const client = await prisma.contact.create({
      data: {
        ...body,
        type: "CLIENT" as const,
        resellerId: reseller.value ?? null,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true },
        },
        reseller: { select: RESELLER_SUMMARY_SELECT },
      },
    });

    const contactName = client.company || `${client.firstName} ${client.lastName}`.trim();
    const operatorName = session.user.name || "Operador";

    await logOperatorAction({
      userId: session.user.id,
      action: "CLIENT_CREATED",
      entityType: "CLIENT",
      entityId: client.id,
      description: client.reseller
        ? `Creó el cliente "${contactName}" como subcliente de "${client.reseller.company || `${client.reseller.firstName} ${client.reseller.lastName}`.trim()}"`
        : `Creó el cliente "${contactName}"`,
      link: "/clients",
    });

    if (session.user.role === "OPERATOR") {
      await notifyAdmins({
        type: "CLIENT_CREATED",
        title: "Nuevo cliente creado",
        message: `<strong>${escapeHtml(operatorName)}</strong> creó el cliente <strong>${escapeHtml(contactName)}</strong>.`,
        link: "/clients",
      });
    }

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating client");
    return NextResponse.json(
      { error: "Error creating client" },
      { status: 500 }
    );
  }
}
