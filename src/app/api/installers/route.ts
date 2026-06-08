import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/installers");

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const country = searchParams.get("country");
    const hasLocal = searchParams.get("hasLocal");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30", 10)));

    const where: Record<string, any> = { type: "INSTALLER" as const };

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ];
    }
    if (country) where.installerCountry = country;
    if (hasLocal === "true") where.hasLocalStore = true;
    if (hasLocal === "false") where.hasLocalStore = false;

    const [installers, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.contact.count({ where }),
    ]);

    return NextResponse.json({
      installers,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching installers");
    return NextResponse.json({ error: "Error al obtener instaladores" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await request.json();
    const { firstName, lastName, phone, email, whatsapp, hasLocalStore, storeAddress, installerCountry, installerProvince, installerDepartment } = body;

    if (!firstName || !lastName) {
      return NextResponse.json({ error: "Nombre y apellido son requeridos" }, { status: 400 });
    }

    const installer = await prisma.contact.create({
      data: {
        type: "INSTALLER" as const,
        firstName,
        lastName,
        phone: phone || null,
        email: email || null,
        whatsapp: whatsapp || null,
        hasLocalStore: !!hasLocalStore,
        storeAddress: hasLocalStore ? (storeAddress || null) : null,
        installerCountry: installerCountry || null,
        installerProvince: installerCountry === "Argentina" ? (installerProvince || null) : null,
        installerDepartment: installerCountry === "Uruguay" ? (installerDepartment || null) : null,
      },
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "INSTALLER_CREATED",
      entityType: "INSTALLER",
      entityId: installer.id,
      description: `Agregó el instalador "${firstName} ${lastName}"`,
      link: "/installers",
    });

    return NextResponse.json(installer, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating installer");
    return NextResponse.json({ error: "Error al crear instalador" }, { status: 500 });
  }
}
