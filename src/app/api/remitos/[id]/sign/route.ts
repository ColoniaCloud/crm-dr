import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";

const log = createLogger("api/remitos/sign");

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const remito = await prisma.remito.findUnique({
      where: { id },
      include: { sale: true },
    });

    if (!remito) {
      return NextResponse.json({ error: "Remito no encontrado" }, { status: 404 });
    }

    if (remito.signedAt) {
      return NextResponse.json({ error: "El remito ya fue firmado" }, { status: 400 });
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.remito.update({
        where: { id },
        data: { signedAt: now },
      });

      await tx.sale.update({
        where: { id: remito.saleId },
        data: { status: "DELIVERED" },
      });

      return r;
    });

    log.info({ remitoId: id, saleId: remito.saleId }, "Remito firmado, venta marcada como entregada");

    await logOperatorAction({ userId: session.user.id, action: "SIGN_REMITO", entityType: "REMITO", entityId: id, description: `Firmó remito (venta #${remito.sale.number})`, link: `/sales/${remito.saleId}` });
    return NextResponse.json(updated);
  } catch (error) {
    log.error({ err: error }, "Error al firmar remito");
    return NextResponse.json(
      { error: "Error al firmar remito" },
      { status: 500 }
    );
  }
}
