import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
const log = createLogger("api/suppliers");

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const suppliers = await prisma.supplier.findMany({
      where: { active: true },
      include: {
        _count: { select: { purchaseOrders: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(suppliers);
  } catch (error) {
    log.error({ err: error }, "Error fetching suppliers");
    return NextResponse.json({ error: "Error fetching suppliers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { name, country, contactName, contactEmail, contactPhone, currency, leadTimeDays, notes } = body;

    if (!name) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: {
        name,
        country,
        contactName,
        contactEmail,
        contactPhone,
        currency: currency ?? "USD",
        leadTimeDays: leadTimeDays ? (isNaN(parseInt(leadTimeDays)) ? null : parseInt(leadTimeDays)) : null,
        notes,
      },
    });

    await logOperatorAction({ userId: session.user.id, action: "CREATE_SUPPLIER", entityType: "SUPPLIER", entityId: supplier.id, description: `Creó proveedor "${name}"` });
    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating supplier");
    return NextResponse.json({ error: "Error creating supplier" }, { status: 500 });
  }
}
