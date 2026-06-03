import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/clients/[id]/warranty-rolls");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const rolls = await prisma.warrantyRoll.findMany({
      where: {
        saleItem: {
          sale: {
            contactId: id,
          },
        },
      },
      include: {
        lot: true,
        product: {
          select: { id: true, name: true, sku: true },
        },
        saleItem: {
          include: {
            sale: {
              select: { id: true, createdAt: true },
            },
          },
        },
        installations: {
          orderBy: { installationNumber: "asc" },
          select: {
            id: true,
            installationNumber: true,
            installationCode: true,
            activationToken: true,
            status: true,
            clientName: true,
            clientEmail: true,
            clientPhone: true,
            clientDni: true,
            assetType: true,
            assetDescription: true,
            installerName: true,
            activatedAt: true,
            expiresAt: true,
          },
        },
        _count: {
          select: {
            installations: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ rolls });
  } catch (error) {
    log.error({ err: error }, "Error fetching warranty rolls");
    return NextResponse.json(
      { error: "Error al cargar garantías" },
      { status: 500 }
    );
  }
}
