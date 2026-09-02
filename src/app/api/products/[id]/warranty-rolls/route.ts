import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { ensureWarrantyRolls } from "@/lib/warranty";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/products/[id]/warranty-rolls");

/**
 * Conciliar el stock de un producto con sus rollos de garantía.
 *
 * ─── El problema que resuelve ──────────────────────────────────────────────
 *
 * Para un producto con garantía, cada unidad en stock **es** un rollo físico, y
 * a cada rollo físico le corresponde un `WarrantyRoll`. Cuando esos dos números
 * no coinciden, hay unidades que se pueden vender pero que no le van a mostrar
 * ningún rollo al Cliente en su panel — y nadie se entera hasta que el Cliente
 * pregunta (hallazgo P-6).
 *
 * El desfasaje venía de que el alta de producto con stock inicial no creaba
 * rollos. Eso ya está arreglado, pero **los productos creados antes siguen
 * descalzados**, y ahí no alcanza con código: crear los rollos que faltan es
 * afirmar que esos rollos existen en el depósito. Eso lo sabe quien los mira,
 * no el sistema.
 *
 * Por eso esto son dos cosas separadas:
 *   - `GET` muestra el desfasaje. Es solo lectura y no afirma nada.
 *   - `POST` crea los que faltan, con la cantidad que el operador confirma.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;

  try {
    const { id } = await params;
    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        stock: true,
        warrantyConfig: { select: { warrantyEnabled: true } },
      },
    });
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    // Sin garantía habilitada no hay nada que conciliar: este producto no
    // participa de la cadena y su stock no tiene por qué tener rollos detrás.
    if (!product.warrantyConfig?.warrantyEnabled) {
      return NextResponse.json({ aplica: false });
    }

    // Solo los libres: un rollo vendido ya no está en stock, y contarlo haría
    // que el desfasaje se agrande solo con cada venta.
    const libres = await prisma.warrantyRoll.count({
      where: { productId: id, status: "IN_STOCK", saleItemId: null },
    });
    const total = await prisma.warrantyRoll.count({ where: { productId: id } });

    return NextResponse.json({
      aplica: true,
      stock: product.stock,
      rollosLibres: libres,
      rollosTotales: total,
      // Positivo: hay unidades en stock sin rollo detrás. Negativo: hay más
      // rollos libres que stock, que también es un desfasaje pero al revés y no
      // se arregla creando — se arregla mirando qué pasó.
      faltantes: product.stock - libres,
    });
  } catch (error) {
    log.error({ err: error }, "Error checking warranty roll coverage");
    return NextResponse.json({ error: "Error al revisar los rollos" }, { status: 500 });
  }
}

const schema = z.object({
  /**
   * Cuántos crear. Se pide explícito en vez de calcularlo solo: quien aprieta
   * el botón está declarando que esa cantidad de rollos existe físicamente, y
   * eso tiene que ser un número que haya mirado, no uno que el sistema asumió.
   */
  cantidad: z.number().int().positive().max(5000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  const json = await request.json().catch(() => null);
  const validation = validateBody(schema, json);
  if (!validation.success) return validation.response;
  const { cantidad } = validation.data;

  try {
    const { id } = await params;
    const product = await prisma.product.findUnique({
      where: { id },
      select: { name: true, warrantyConfig: { select: { warrantyEnabled: true } } },
    });
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    if (!product.warrantyConfig?.warrantyEnabled) {
      return NextResponse.json(
        { error: "Este producto no tiene la garantía habilitada, así que no lleva rollos." },
        { status: 400 }
      );
    }

    // No toca el stock a propósito: el stock ya es el correcto, lo que falta
    // son los rollos que lo respaldan. Un ajuste de stock sería otra cosa.
    await prisma.$transaction(async (tx) => {
      await ensureWarrantyRolls(tx, id, cantidad, { type: "MANUAL_ADJUSTMENT" });
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "CREATE_WARRANTY_ROLLS",
      entityType: "PRODUCT",
      entityId: id,
      description: `Generó ${cantidad} rollo(s) de garantía para "${product.name}" (conciliación de stock)`,
      link: `/products/${id}`,
    });

    return NextResponse.json({ creados: cantidad });
  } catch (error) {
    log.error({ err: error }, "Error creating warranty rolls");
    return NextResponse.json({ error: "Error al generar los rollos" }, { status: 500 });
  }
}
