import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
const log = createLogger("api/competitors");

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const competitors = await prisma.competitor.findMany({
      include: {
        products: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(competitors);
  } catch (error) {
    log.error({ err: error }, "Error fetching competitors");
    return NextResponse.json(
      { error: "Error fetching competitors" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await request.json();

    const competitor = await prisma.competitor.create({
      data: body,
      include: {
        products: true,
      },
    });

    await logOperatorAction({ userId: session.user.id, action: "CREATE_COMPETITOR", entityType: "COMPETITOR", entityId: competitor.id, description: `Creó competidor "${body.name}"` });
    return NextResponse.json(competitor, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating competitor");
    return NextResponse.json(
      { error: "Error creating competitor" },
      { status: 500 }
    );
  }
}
