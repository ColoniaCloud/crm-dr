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

    // Unidades con código de trazabilidad que están en stock y no tienen rollo.
    // Es el caso de haber generado las unidades ANTES de configurarle la
    // garantía al producto: los códigos existen, la garantía no. Y no se pueden
    // regenerar, porque el sistema no deja pasar del stock.
    const unidadesSinRollo = await prisma.productUnit.count({
      where: { productId: id, warrantyRoll: null, saleItem: null },
    });

    return NextResponse.json({
      aplica: true,
      stock: product.stock,
      rollosLibres: libres,
      rollosTotales: total,
      unidadesSinRollo,
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

    // Los rollos nuevos se enganchan a las unidades que quedaron sin uno.
    //
    // Sin esto quedaban sueltos, y eso importa cuando se vende eligiendo la
    // unidad exacta: `linkRollToSaleItem` busca el rollo DE ESA unidad, y si no
    // lo encuentra no asigna ninguno — ni siquiera cae a la búsqueda genérica,
    // que está cortada cuando hay unidad especificada. O sea que 120 unidades
    // trazadas sin rollo eran 120 ventas futuras sin garantía.
    //
    // Solo unidades **en stock**: darle un rollo a una unidad ya vendida no
    // arregla aquella venta, y dejaría un rollo IN_STOCK atado a algo que ya no
    // está. Si sobran rollos después de cubrirlas, esos van sueltos, que es lo
    // correcto para el stock que no tiene código de unidad.
    const unidades = await prisma.productUnit.findMany({
      where: { productId: id, warrantyRoll: null, saleItem: null },
      orderBy: { createdAt: "asc" },
      take: cantidad,
      select: { id: true },
    });

    // No toca el stock a propósito: el stock ya es el correcto, lo que falta
    // son los rollos que lo respaldan. Un ajuste de stock sería otra cosa.
    await prisma.$transaction(async (tx) => {
      await ensureWarrantyRolls(tx, id, cantidad, {
        type: "MANUAL_ADJUSTMENT",
        unitIds: unidades.map((u) => u.id),
      });
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "CREATE_WARRANTY_ROLLS",
      entityType: "PRODUCT",
      entityId: id,
      description:
        `Generó ${cantidad} rollo(s) de garantía para "${product.name}" (conciliación de stock)` +
        (unidades.length > 0 ? `, ${unidades.length} vinculado(s) a unidades existentes` : ""),
      link: `/products/${id}`,
    });

    return NextResponse.json({ creados: cantidad, vinculados: unidades.length });
  } catch (error) {
    log.error({ err: error }, "Error creating warranty rolls");
    return NextResponse.json({ error: "Error al generar los rollos" }, { status: 500 });
  }
}
