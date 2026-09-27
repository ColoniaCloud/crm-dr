import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
import { DISCOUNT_TAG_TYPES, describeTag } from "@/lib/discount-tags";

const log = createLogger("api/discount-tags/[id]");

const updateSchema = z.object({
  // El `code` sí se puede cambiar acá, al revés de CreditTier. Es seguro porque
  // nadie referencia una etiqueta por su código: los contactos la referencian
  // por id, y cada venta se guardó su propia copia legible
  // (`Sale.discountTagLabel`), así que renombrar no reescribe el pasado.
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(1).optional(),
  type: z.enum(DISCOUNT_TAG_TYPES).optional(),
  value: z.number().positive().optional(),
  active: z.boolean().optional(),
});

// PATCH — SUPERADMIN.
//
// Ojo con lo que significa editar: el descuento se calcula al crear cada venta,
// así que cambiar el valor de una etiqueta cambia el precio de **las próximas**
// ventas de todos los contactos que la tienen. Las ya hechas no se mueven.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id } = await params;
    const body = await request.json();
    const validation = validateBody(updateSchema, body);
    if (!validation.success) return validation.response;
    const data = validation.data;

    const current = await prisma.discountTag.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Etiqueta no encontrada" }, { status: 404 });
    }

    // El tipo y el valor se validan juntos: puede venir uno solo, y lo que
    // importa es cómo queda la etiqueta después del cambio.
    const finalType = data.type ?? current.type;
    const finalValue = data.value ?? Number(current.value);
    if (finalType === "PERCENTAGE" && finalValue > 100) {
      return NextResponse.json({ error: "Un descuento en porcentaje no puede pasar de 100" }, { status: 400 });
    }

    if (data.code && data.code !== current.code) {
      const taken = await prisma.discountTag.findUnique({ where: { code: data.code } });
      if (taken) {
        return NextResponse.json({ error: `Ya existe una etiqueta con código "${data.code}"` }, { status: 400 });
      }
    }

    const tag = await prisma.discountTag.update({ where: { id }, data });

    await logOperatorAction({
      userId: session.user.id,
      action: "UPDATE_DISCOUNT_TAG",
      entityType: "DISCOUNT_TAG",
      entityId: id,
      description: `Actualizó etiqueta de descuento ${describeTag(tag)}${tag.active ? "" : " (desactivada)"}`,
      link: "/settings",
    });

    return NextResponse.json(tag);
  } catch (error) {
    log.error({ err: error }, "Error updating discount tag");
    return NextResponse.json({ error: "Error al actualizar la etiqueta" }, { status: 500 });
  }
}

// DELETE — SUPERADMIN. Borra la etiqueta de verdad.
//
// Si hay contactos con la etiqueta puesta, borrarla les sube el precio a todos
// de una: no es algo que deba pasar por un click distraído ni por una llamada
// suelta a la API. Así que en ese caso se rechaza y se devuelve
// `code: "TAG_IN_USE"` con la cantidad, para que la UI pregunte; recién con
// `?force=true` se desasigna y se borra, todo en una transacción.
//
// Las ventas ya hechas no se pierden: `Sale.discountTagId` es `onDelete:
// SetNull` y cada una se guardó su propia copia legible de la etiqueta, así que
// siguen explicando su descuento después del borrado.
//
// Para dejar de usar una etiqueta sin tocar a nadie, lo correcto es
// desactivarla (`PATCH { active: false }`).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id } = await params;
    const force = new URL(request.url).searchParams.get("force") === "true";

    const tag = await prisma.discountTag.findUnique({
      where: { id },
      include: { _count: { select: { contacts: true } } },
    });
    if (!tag) {
      return NextResponse.json({ error: "Etiqueta no encontrada" }, { status: 404 });
    }

    const enUso = tag._count.contacts;
    if (enUso > 0 && !force) {
      return NextResponse.json(
        {
          error:
            `${enUso} ${enUso === 1 ? "contacto tiene" : "contactos tienen"} esta etiqueta. ` +
            `Si la borrás, dejan de recibir el descuento y pasan a precio de lista.`,
          code: "TAG_IN_USE",
          contacts: enUso,
        },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.contact.updateMany({ where: { discountTagId: id }, data: { discountTagId: null } });
      await tx.discountTag.delete({ where: { id } });
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "DELETE_DISCOUNT_TAG",
      entityType: "DISCOUNT_TAG",
      entityId: id,
      description:
        `Borró la etiqueta de descuento ${describeTag(tag)}` +
        (enUso > 0 ? ` — ${enUso} contacto(s) quedaron sin etiqueta` : ""),
      link: "/settings",
    });

    return NextResponse.json({ ok: true, unassigned: enUso });
  } catch (error) {
    log.error({ err: error }, "Error deleting discount tag");
    return NextResponse.json({ error: "Error al borrar la etiqueta" }, { status: 500 });
  }
}
