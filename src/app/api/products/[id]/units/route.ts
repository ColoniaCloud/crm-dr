import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { auth } from "@/lib/auth";
const log = createLogger("api/products/[id]/units");

// Abbreviation map for unit code generation
const ABBREV: Record<string, string> = {
  AUTOMOTIVE_PREMIUM: "PREM",
  AUTOMOTIVE_NANOCERAMIC: "NCRC",
  AUTOMOTIVE_NANOCARBON: "NCRB",
  AUTOMOTIVE_SAFETY: "SAFE",
  AUTOMOTIVE_PPF: "PPF",
  AUTOMOTIVE: "AUTO",
  ARCHITECTURAL: "ARQ",
  PPF: "PPF",
};

function getAbbrev(category: string, subcategory?: string | null): string {
  if (subcategory) {
    const key = `${category}_${subcategory}`;
    if (ABBREV[key]) return ABBREV[key];
  }
  return ABBREV[category] ?? category.slice(0, 4).toUpperCase();
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const units = await prisma.productUnit.findMany({
      where: { productId: id },
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(units);
  } catch {
    return NextResponse.json({ error: "Error al obtener unidades" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id: productId } = await params;
    const { quantity = 1 } = await request.json();

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { category: true, subcategory: true, shade: true },
    });
    if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    const abbrev = getAbbrev(product.category, product.subcategory);
    const shade = (product.shade ?? "00").replace(/[^0-9a-zA-Z]/g, "");

    // Count existing units to generate sequential codes
    const existingCount = await prisma.productUnit.count({ where: { productId } });

    const units = [];
    for (let i = 0; i < quantity; i++) {
      const seq = pad4(existingCount + i + 1);
      const code = `${abbrev}-${shade}-${seq}`;
      units.push({ productId, code });
    }

    await prisma.productUnit.createMany({ data: units, skipDuplicates: true });

    // Update product stock
    await prisma.product.update({
      where: { id: productId },
      data: { stock: { increment: quantity } },
    });

    await logOperatorAction({ userId: session.user.id, action: "CREATE_UNITS", entityType: "PRODUCT", entityId: productId, description: `Creó ${units.length} unidad(es) de producto`, link: `/products/${productId}` });
    return NextResponse.json({ created: units.length, codes: units.map((u) => u.code) }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating units");
    return NextResponse.json({ error: "Error al crear unidades" }, { status: 500 });
  }
}
