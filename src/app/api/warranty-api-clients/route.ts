import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { generateApiKey, hashApiKey } from "@/lib/warranty-api-auth";

const log = createLogger("api/warranty-api-clients");

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const clients = await prisma.warrantyApiClient.findMany({
      select: { id: true, name: true, active: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(clients);
  } catch (error) {
    log.error({ err: error }, "Error fetching warranty api clients");
    return NextResponse.json({ error: "Error al obtener los clientes de API" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const { name } = await request.json();
    if (!name) {
      return NextResponse.json({ error: "name es requerido" }, { status: 400 });
    }

    const apiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey);

    const client = await prisma.warrantyApiClient.create({
      data: { name, apiKeyHash },
      select: { id: true, name: true, active: true, createdAt: true },
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "CREATE_WARRANTY_API_CLIENT",
      entityType: "WARRANTY_API_CLIENT",
      entityId: client.id,
      description: `Creó una API key de garantías para "${name}"`,
    });

    // apiKey is only ever returned once, at creation time
    return NextResponse.json({ ...client, apiKey }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating warranty api client");
    return NextResponse.json({ error: "Error al crear el cliente de API" }, { status: 500 });
  }
}
