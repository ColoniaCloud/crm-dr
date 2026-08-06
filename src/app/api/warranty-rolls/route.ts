import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import type { Prisma, ProductCategory } from "@prisma/client";

const log = createLogger("api/warranty-rolls");

/**
 * GET /api/warranty-rolls — listado filtrable de rollos para la vista de
 * "Rollos por ubicación" del Centro de Garantías. Cuatro filtros soportados,
 * combinables entre sí:
 *
 *   ?location=DEPOSITO|LOCAL|PUNTO_REVENTA|INSTALADOR
 *   ?locationId=<id>        (un Punto de Reventa puntual, cuando hay varios)
 *   ?category=AUTOMOTIVE|ARCHITECTURAL|PPF
 *   ?code=<texto>           (contains sobre fullRollCode)
 *   ?contactId=<id>         (instalador: consignado en su Punto de Reventa
 *                            y/o ya vendido a él)
 *
 * "INSTALADOR" no es una Location — es cualquier rollo que ya se vendió
 * (tiene saleItem), independientemente de dónde haya estado antes.
 */
export async function GET(request: Request) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const location = searchParams.get("location");
    const locationId = searchParams.get("locationId");
    const category = searchParams.get("category");
    const code = searchParams.get("code");
    const contactId = searchParams.get("contactId");

    const where: Prisma.WarrantyRollWhereInput = {};

    if (location === "INSTALADOR") {
      where.saleItemId = { not: null };
    } else if (locationId) {
      where.status = "IN_STOCK";
      where.currentLocationId = locationId;
    } else if (location === "DEPOSITO" || location === "LOCAL" || location === "PUNTO_REVENTA") {
      where.status = "IN_STOCK";
      where.currentLocation = { type: location };
    }

    if (category) {
      where.product = { category: category as ProductCategory };
    }

    if (code) {
      where.fullRollCode = { contains: code };
    }

    if (contactId) {
      where.OR = [
        { currentLocation: { contactId } },
        { saleItem: { sale: { contactId } } },
      ];
    }

    const rolls = await prisma.warrantyRoll.findMany({
      where,
      include: {
        lot: true,
        product: { select: { id: true, name: true, sku: true, category: true } },
        currentLocation: {
          select: {
            id: true,
            type: true,
            name: true,
            contact: { select: { id: true, firstName: true, lastName: true, company: true } },
          },
        },
        saleItem: {
          include: {
            sale: {
              select: {
                id: true,
                number: true,
                createdAt: true,
                contact: { select: { id: true, firstName: true, lastName: true, company: true } },
              },
            },
          },
        },
        _count: { select: { installations: { where: { status: "ACTIVE" } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json(rolls);
  } catch (error) {
    log.error({ err: error }, "Error fetching warranty rolls");
    return NextResponse.json({ error: "Error al listar rollos" }, { status: 500 });
  }
}
