import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalApiKey, requireNivel } from "@/lib/portal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { findClientContact } from "@/lib/client-portal";
import { getContactProductTags, describeTag } from "@/lib/discount-tags";
import { round2 } from "@/lib/discount-tag-calc";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/portal/v1/contacts/[contactId]/prices");

/**
 * Los precios de un revendedor: qué le sale cada producto **a él**.
 *
 * Es la razón por la que los descuentos pactados viven en la base y no en un
 * Excel del CEO: el revendedor los consulta solo, a las once de la noche, sin
 * llamar a nadie.
 *
 * ─── No hay ninguna tabla de precios detrás ────────────────────────────────
 *
 * El precio de lista es **uno solo para todos** (`Product.price`). Lo que varía
 * es el descuento, y sale de la misma precedencia que usa la venta
 * (`resolveLineTag`): el acuerdo por producto si lo hay, y si no la etiqueta
 * general del contacto — salvo que tenga acuerdos cargados, en cuyo caso la
 * general no se aplica a nada.
 *
 * **Que sea la misma función importa.** Si esta pantalla calculara aparte, el
 * revendedor podría ver un precio que la venta después no respeta, y el que
 * queda mal es el vendedor en el mostrador.
 *
 * Nivel `RESELLER`. Un instalador no lo ve: su precio es su etiqueta general y
 * ya lo tiene en la ficha.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const gate = await requirePortalApiKey(request);
  if (!gate.success) return gate.response;

  const rl = rateLimit(`portal-api:${gate.client.id}`, 300, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const { contactId } = await params;
    const contact = await findClientContact(contactId);
    if (!contact) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const level = await requireNivel(contactId, request, ["RESELLER"]);
    if (!level.success) return level.response;

    const products = await prisma.product.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        sku: true,
        category: true,
        subcategory: true,
        brand: true,
        shade: true,
        width: true,
        length: true,
        price: true,
        imageUrl: true,
      },
    });

    const tags = await getContactProductTags(
      contactId,
      products.map((p) => p.id)
    );

    const items = products.map((product) => {
      const tag = tags[product.id] ?? null;
      const precioLista = Number(product.price);
      // La misma aritmética que la venta: el descuento se calcula sobre el total
      // de la línea, que acá es el precio de una unidad.
      const descuento =
        tag && precioLista > 0
          ? tag.type === "FIXED"
            ? Math.min(tag.value, precioLista)
            : round2(precioLista * (tag.value / 100))
          : 0;

      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        subcategory: product.subcategory,
        brand: product.brand,
        shade: product.shade,
        width: product.width ? Number(product.width) : null,
        length: product.length ? Number(product.length) : null,
        imageUrl: product.imageUrl,
        /** Precio de lista, IVA incluido. Igual para todos. */
        precioLista,
        /** Lo que le sale a ESTE contacto. Igual al de lista si no lleva descuento. */
        precioConDescuento: round2(precioLista - descuento),
        descuento: round2(descuento),
        /**
         * La etiqueta que le corresponde en este producto, o null si va a precio
         * de lista. `label` es el texto que ya se muestra en el CRM, para que las
         * dos pantallas digan lo mismo.
         */
        etiqueta: tag
          ? { code: tag.code, name: tag.name, type: tag.type, value: tag.value, label: describeTag(tag) }
          : null,
      };
    });

    return NextResponse.json({
      items,
      /**
       * Cuántos productos llevan descuento. La pantalla lo usa para decir algo
       * útil cuando son cero, en vez de mostrar una lista larga de precios de
       * lista sin explicar por qué.
       */
      conDescuento: items.filter((i) => i.descuento > 0).length,
      /** Para el pie: "los precios incluyen IVA". Ver el comentario en /api/sales. */
      ivaIncluido: true,
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching reseller prices");
    return NextResponse.json({ error: "Error al cargar los precios" }, { status: 500 });
  }
}
