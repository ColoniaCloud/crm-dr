import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
const log = createLogger("api/products/bulk");

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { ids, action } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "IDs requeridos" }, { status: 400 });
    }
    if (!["delete", "deactivate", "activate"].includes(action)) {
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    }

    if (action === "delete") {
      await prisma.$transaction([
        prisma.quoteItem.deleteMany({ where: { productId: { in: ids } } }),
        prisma.saleItem.deleteMany({ where: { productId: { in: ids } } }),
        prisma.product.deleteMany({ where: { id: { in: ids } } }),
      ]);
      await logOperatorAction({ userId: session.user.id, action: "BULK_DELETE_PRODUCTS", entityType: "PRODUCT", description: `Eliminó ${ids.length} producto(s) masivamente` });
      return NextResponse.json({ message: `${ids.length} producto(s) eliminados` });
    }

    if (action === "deactivate") {
      await prisma.product.updateMany({
        where: { id: { in: ids } },
        data: { active: false },
      });
      await logOperatorAction({ userId: session.user.id, action: "BULK_DEACTIVATE_PRODUCTS", entityType: "PRODUCT", description: `Desactivó ${ids.length} producto(s)` });
      return NextResponse.json({ message: `${ids.length} producto(s) desactivados` });
    }

    if (action === "activate") {
      await prisma.product.updateMany({
        where: { id: { in: ids } },
        data: { active: true },
      });
      await logOperatorAction({ userId: session.user.id, action: "BULK_ACTIVATE_PRODUCTS", entityType: "PRODUCT", description: `Activó ${ids.length} producto(s)` });
      return NextResponse.json({ message: `${ids.length} producto(s) activados` });
    }
  } catch (error) {
    log.error({ err: error }, "Error en operación masiva");
    return NextResponse.json({ error: "Error en operación" }, { status: 500 });
  }
}
