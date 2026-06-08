import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/installers/import-from-lead");

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";

  if (!search || search.length < 2) {
    return NextResponse.json({ leads: [] });
  }

  try {
    const leads = await prisma.contact.findMany({
      where: {
        type: "LEAD",
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { company: { contains: search } },
          { phone: { contains: search } },
          { email: { contains: search } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, company: true, phone: true, email: true, whatsapp: true },
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ leads });
  } catch (error) {
    log.error({ err: error }, "Error searching leads");
    return NextResponse.json({ error: "Error al buscar leads" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { leadId } = await request.json();
    if (!leadId) return NextResponse.json({ error: "leadId requerido" }, { status: 400 });

    const lead = await prisma.contact.findFirst({ where: { id: leadId, type: "LEAD" } });
    if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

    const installer = await prisma.contact.create({
      data: {
        type: "INSTALLER" as const,
        firstName: lead.firstName,
        lastName: lead.lastName,
        phone: lead.phone,
        email: lead.email,
        whatsapp: lead.whatsapp,
        hasLocalStore: false,
      },
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "INSTALLER_CREATED",
      entityType: "INSTALLER",
      entityId: installer.id,
      description: `Importó instalador desde lead "${lead.firstName} ${lead.lastName}"`,
      link: "/installers",
    });

    return NextResponse.json(installer, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error importing installer from lead");
    return NextResponse.json({ error: "Error al importar desde lead" }, { status: 500 });
  }
}
