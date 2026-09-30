import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { getContactProductTags } from "@/lib/discount-tags";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/clients/[id]/product-tags");

/**
 * Qué etiqueta de descuento le corresponde a este contacto **en cada producto**,
 * ya resuelta. Es lo que el formulario de venta usa para precargar el dropdown de
 * cada línea.
 *
 * ─── Por qué un endpoint y no resolverlo en el formulario ───────────────────
 *
 * La precedencia tiene una regla que no es obvia: un contacto con al menos un
 * acuerdo por producto **deja de usar su etiqueta general para todo**
 * (`resolveLineTag` en src/lib/discount-tags.ts). Si el formulario la
 * reimplementara, mostraría un descuento y el servidor guardaría otro — y el POS
 * tendría que reimplementarla una tercera vez.
 *
 * Así que la regla vive en un solo lado y las pantallas reciben el resultado. Es
 * la misma decisión que ya está documentada para el cálculo del descuento: las
 * pantallas muestran, el servidor decide.
 *
 * Devuelve un mapa `productId → etiqueta | null` de **todos los productos
 * activos**. Son ~200 filas livianas y el formulario deja al operador cambiar de
 * producto sin volver a pedir nada.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;

  try {
    const { id } = await params;
    const contact = await prisma.contact.findUnique({ where: { id }, select: { id: true } });
    if (!contact) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    const products = await prisma.product.findMany({
      where: { active: true },
      select: { id: true },
    });

    const tags = await getContactProductTags(
      id,
      products.map((p) => p.id)
    );

    return NextResponse.json({ tags });
  } catch (error) {
    log.error({ err: error }, "Error resolviendo etiquetas por producto");
    return NextResponse.json({ error: "Error al obtener los descuentos del cliente" }, { status: 500 });
  }
}
