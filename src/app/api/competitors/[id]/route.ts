import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ProductCategory } from "@prisma/client";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { auth } from "@/lib/auth";
const log = createLogger("api/competitors/[id]");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const competitor = await prisma.competitor.findUnique({
      where: { id },
      include: {
        products: true,
      },
    });

    if (!competitor) {
      return NextResponse.json(
        { error: "Competitor not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(competitor);
  } catch (error) {
    log.error({ err: error }, "Error fetching competitor");
    return NextResponse.json(
      { error: "Error fetching competitor" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const { products, ...competitorData } = body;

    const competitor = await prisma.$transaction(async (tx) => {
      // Update competitor fields
      const updated = await tx.competitor.update({
        where: { id },
        data: competitorData,
      });

      // If products array is provided, replace all products
      if (products && Array.isArray(products)) {
        await tx.competitorProduct.deleteMany({
          where: { competitorId: id },
        });

        if (products.length > 0) {
          await tx.competitorProduct.createMany({
            data: products.map(
              (p: { name: string; category: string; brand?: string; shade?: string; price: number; notes?: string }) => ({
                competitorId: id,
                name: p.name,
                category: p.category as ProductCategory,
                brand: p.brand,
                shade: p.shade,
                price: p.price,
                notes: p.notes,
              })
            ),
          });
        }
      }

      return updated;
    });

    const result = await prisma.competitor.findUnique({
      where: { id: competitor.id },
      include: { products: true },
    });

    await logOperatorAction({ userId: session.user.id, action: "UPDATE_COMPETITOR", entityType: "COMPETITOR", entityId: id, description: `Actualizó competidor "${result?.name}"` });
    return NextResponse.json(result);
  } catch (error) {
    log.error({ err: error }, "Error updating competitor");
    return NextResponse.json(
      { error: "Error updating competitor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;

    const comp = await prisma.competitor.findUnique({ where: { id }, select: { name: true } });
    await prisma.competitor.delete({
      where: { id },
    });

    await logOperatorAction({ userId: session.user.id, action: "DELETE_COMPETITOR", entityType: "COMPETITOR", entityId: id, description: `Eliminó competidor "${comp?.name}"` });
    return NextResponse.json({ message: "Competitor deleted successfully" });
  } catch (error) {
    log.error({ err: error }, "Error deleting competitor");
    return NextResponse.json(
      { error: "Error deleting competitor" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    const competitor = await prisma.competitor.findUnique({
      where: { id },
    });

    if (!competitor) {
      return NextResponse.json(
        { error: "Competitor not found" },
        { status: 404 }
      );
    }

    const product = await prisma.competitorProduct.create({
      data: {
        competitorId: id,
        ...body,
      },
    });

    await logOperatorAction({ userId: session.user.id, action: "ADD_COMPETITOR_PRODUCT", entityType: "COMPETITOR", entityId: id, description: `Agregó producto "${body.name}" a competidor` });
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error adding competitor product");
    return NextResponse.json(
      { error: "Error adding competitor product" },
      { status: 500 }
    );
  }
}
