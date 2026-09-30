import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { describeTag } from "@/lib/discount-tags";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/clients/[id]/product-discounts");

/**
 * Los descuentos pactados de un contacto, producto por producto.
 *
 * Es lo que permite que a un revendedor se le descuente 16,66% en una lámina y
 * nada en las otras dos de la misma venta — algo que su etiqueta general no
 * puede expresar, porque es una sola para toda la venta.
 *
 * ─── La regla que hay que tener presente al tocar esto ──────────────────────
 *
 * Un contacto con **al menos un** acuerdo acá deja de usar su etiqueta general
 * **para todo**, no solo para los productos con acuerdo (ver `resolveLineTag` en
 * src/lib/discount-tags.ts). Así que:
 *
 *   - Guardar el PRIMER acuerdo de un contacto que tenía etiqueta general le
 *     cambia el precio de todo lo demás. El GET devuelve `apagaEtiquetaGeneral`
 *     para que la ficha pueda avisarlo antes.
 *   - Borrar el ÚLTIMO se lo devuelve. La etiqueta general nunca se toca desde
 *     acá: queda guardada, y eso es lo que hace la operación reversible.
 *
 * ADMIN+ en todos los verbos, igual que la etiqueta general
 * (`discount-tag-card.tsx` la edita solo para admins): un acuerdo es plata.
 */

const upsertSchema = z.object({
  productId: z.string().min(1),
  discountTagId: z.string().min(1),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;

  try {
    const { id } = await params;
    const contact = await prisma.contact.findUnique({
      where: { id },
      select: {
        id: true,
        discountTag: { select: { id: true, code: true, name: true, type: true, value: true, active: true } },
        productDiscounts: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            productId: true,
            product: { select: { id: true, name: true, sku: true } },
            discountTag: { select: { id: true, code: true, name: true, type: true, value: true, active: true } },
          },
        },
      },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    const acuerdos = contact.productDiscounts.map((a) => ({
      id: a.id,
      productId: a.productId,
      productName: a.product.name,
      productSku: a.product.sku,
      discountTag: { ...a.discountTag, value: Number(a.discountTag.value) },
      label: describeTag(a.discountTag),
    }));

    // Solo cuentan los acuerdos con etiqueta activa, igual que en
    // getContactDiscounts(): si se desactiva la única etiqueta pactada, el
    // contacto vuelve a su etiqueta general en vez de quedarse sin descuento.
    const activos = acuerdos.filter((a) => a.discountTag.active).length;

    return NextResponse.json({
      acuerdos,
      /** La etiqueta general, para que la ficha pueda decir qué se está apagando. */
      etiquetaGeneral: contact.discountTag
        ? {
            ...contact.discountTag,
            value: Number(contact.discountTag.value),
            label: describeTag(contact.discountTag),
          }
        : null,
      /**
       * `true` cuando hay acuerdos activos: el contacto está en modo acuerdos y su
       * etiqueta general **no se aplica**. La ficha lo muestra como dos modos
       * excluyentes, no como dos bloques que parecen sumarse.
       */
      modoAcuerdos: activos > 0,
      /**
       * `true` cuando guardar un acuerdo más sería el primero y hay etiqueta
       * general activa que se va a apagar. Es la confirmación que evita cambiarle
       * los precios a un contacto sin querer.
       */
      apagaEtiquetaGeneral: activos === 0 && !!contact.discountTag?.active,
    });
  } catch (error) {
    log.error({ err: error }, "Error listando acuerdos por producto");
    return NextResponse.json({ error: "Error al obtener los descuentos pactados" }, { status: 500 });
  }
}

/** Crea o reemplaza el acuerdo de un producto. Idempotente por (contacto, producto). */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id } = await params;
    const validation = validateBody(upsertSchema, await request.json().catch(() => null));
    if (!validation.success) return validation.response;
    const { productId, discountTagId } = validation.data;

    const [contact, product, tag] = await Promise.all([
      prisma.contact.findUnique({ where: { id }, select: { id: true, firstName: true, lastName: true, company: true } }),
      prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true } }),
      prisma.discountTag.findUnique({ where: { id: discountTagId } }),
    ]);
    if (!contact) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    if (!tag) return NextResponse.json({ error: "Etiqueta no encontrada" }, { status: 404 });
    // Una etiqueta desactivada no descuenta nada, así que pactarla es cargar un
    // acuerdo que no hace nada — y peor: cuenta para el modo acuerdos de la
    // pantalla mientras no descuenta. Se corta acá.
    if (!tag.active) {
      return NextResponse.json(
        { error: "Esa etiqueta está desactivada: no descontaría nada. Activala primero." },
        { status: 400 }
      );
    }

    await prisma.contactProductDiscount.upsert({
      where: { contactId_productId: { contactId: id, productId } },
      create: { contactId: id, productId, discountTagId },
      update: { discountTagId },
    });

    const quien = contact.company || `${contact.firstName} ${contact.lastName}`;
    await logOperatorAction({
      userId: session.user.id,
      action: "SET_PRODUCT_DISCOUNT",
      entityType: "CONTACT",
      entityId: id,
      description: `Pactó ${describeTag(tag)} en "${product.name}" para ${quien}`,
      link: `/clients/${id}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error guardando acuerdo por producto");
    return NextResponse.json({ error: "Error al guardar el descuento pactado" }, { status: 500 });
  }
}

/** Quita el acuerdo de un producto. `?productId=` en la query. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id } = await params;
    const productId = new URL(request.url).searchParams.get("productId");
    if (!productId) {
      return NextResponse.json({ error: "Falta el productId" }, { status: 400 });
    }

    const acuerdo = await prisma.contactProductDiscount.findUnique({
      where: { contactId_productId: { contactId: id, productId } },
      select: { product: { select: { name: true } }, discountTag: true },
    });
    if (!acuerdo) {
      return NextResponse.json({ error: "Ese contacto no tiene acuerdo para ese producto" }, { status: 404 });
    }

    await prisma.contactProductDiscount.delete({
      where: { contactId_productId: { contactId: id, productId } },
    });

    // Si era el último, este contacto vuelve a usar su etiqueta general — que
    // nunca se borró justamente para esto. Queda en el log porque es un cambio
    // de precios y no se ve en ninguna otra parte.
    const quedan = await prisma.contactProductDiscount.count({ where: { contactId: id } });
    await logOperatorAction({
      userId: session.user.id,
      action: "UNSET_PRODUCT_DISCOUNT",
      entityType: "CONTACT",
      entityId: id,
      description:
        `Quitó el descuento pactado de "${acuerdo.product.name}"` +
        (quedan === 0 ? " (era el último: vuelve a aplicarse la etiqueta general)" : ""),
      link: `/clients/${id}`,
    });

    return NextResponse.json({ ok: true, quedan });
  } catch (error) {
    log.error({ err: error }, "Error borrando acuerdo por producto");
    return NextResponse.json({ error: "Error al quitar el descuento pactado" }, { status: 500 });
  }
}
