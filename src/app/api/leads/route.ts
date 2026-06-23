import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logOperatorAction, notifyAdmins, escapeHtml } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/leads");

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const city = searchParams.get("city");
    const state = searchParams.get("state");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limitParam = searchParams.get("limit");
    const isAll = limitParam === "all";
    const limit = isAll
      ? undefined
      : Math.min(100, Math.max(1, parseInt(limitParam || "30", 10)));

    const where: Record<string, any> = { type: "LEAD" as const };

    if (search) {
      where.OR = [
        { id: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { company: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }
    if (city) where.city = { contains: city };
    if (state) where.state = state;
    const neighborhoodFilter = searchParams.get("neighborhood");
    if (neighborhoodFilter) where.neighborhood = { contains: neighborhoodFilter };

    // Nuevos filtros
    const contacted = searchParams.get("contacted");
    if (contacted !== null) where.contacted = contacted === "true";

    const sector = searchParams.get("sector");
    if (sector) where.sector = sector;

    const tagId = searchParams.get("tagId");
    if (tagId) {
      where.tags = {
        some: {
          tag: { id: tagId }
        }
      };
    }

    const hasAddress = searchParams.get("hasAddress");
    if (hasAddress === "1") where.address = { not: null };

    const myLeads = searchParams.get("myLeads");
    if (myLeads === "1" && session?.user?.id) {
      where.assignedToId = session.user.id;
    }

    // Ordenamiento por fecha
    const sortDate = searchParams.get("sortDate");
    const validSort: "asc" | "desc" = sortDate === "asc" ? "asc" : "desc";
    const orderBy = { createdAt: validSort };

    const minimal = searchParams.get("minimal") === "true";
    if (minimal) {
      const leads = await prisma.contact.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          cuit: true,
          type: true,
        },
        orderBy,
        skip: isAll ? undefined : (page - 1) * (limit ?? 30),
        take: isAll ? undefined : limit,
      });
      return NextResponse.json({ leads });
    }

    const [leads, total, distinctStates] = await Promise.all([
      prisma.contact.findMany({
        where,
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true },
          },
          tags: {
            include: { tag: true },
          },
        },
        orderBy,
        skip: isAll ? undefined : (page - 1) * (limit ?? 30),
        take: isAll ? undefined : limit,
      }),
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where: { type: "LEAD" as const, state: { not: null } },
        select: { state: true },
        distinct: ["state"],
        orderBy: { state: "asc" },
      }),
    ]);

    // Fetch cities for the selected state, and neighborhoods for selected state+city
    const distinctCities = state
      ? await prisma.contact.findMany({
          where: { type: "LEAD" as const, state, city: { not: null } },
          select: { city: true },
          distinct: ["city"],
          orderBy: { city: "asc" },
        })
      : [];

    const distinctNeighborhoods = state && city
      ? await prisma.contact.findMany({
          where: { type: "LEAD" as const, state, city: { contains: city }, neighborhood: { not: null } },
          select: { neighborhood: true },
          distinct: ["neighborhood"],
          orderBy: { neighborhood: "asc" },
        })
      : [];

    return NextResponse.json({
      leads,
      total,
      page,
      totalPages: Math.ceil(total / (limit ?? 30)),
      states: distinctStates.map((s) => s.state).filter(Boolean),
      cities: distinctCities.map((c) => c.city).filter(Boolean),
      neighborhoods: distinctNeighborhoods.map((n) => n.neighborhood).filter(Boolean),
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching leads");
    return NextResponse.json(
      { error: "Error fetching leads" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const body = await request.json();

    const lead = await prisma.contact.create({
      data: {
        ...body,
        type: "LEAD" as const,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (session?.user?.id) {
      const contactName = lead.company || `${lead.firstName} ${lead.lastName}`.trim();
      const operatorName = session.user.name || "Operador";

      await logOperatorAction({
        userId: session.user.id,
        action: "LEAD_CREATED",
        entityType: "LEAD",
        entityId: lead.id,
        description: `Agregó el lead "${contactName}"`,
        link: "/leads",
      });

      if (session.user.role === "OPERATOR") {
        await notifyAdmins({
          type: "LEAD_CREATED",
          title: "Nuevo lead agregado",
          message: `<strong>${escapeHtml(operatorName)}</strong> agregó el lead <strong>${escapeHtml(contactName)}</strong>.`,
          link: "/leads",
        });
      }
    }

    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating lead");
    return NextResponse.json(
      { error: "Error creating lead" },
      { status: 500 }
    );
  }
}
