import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
import { DISCOUNT_TAG_TYPES, describeTag } from "@/lib/discount-tags";

const log = createLogger("api/discount-tags");

// GET — cualquier usuario autenticado (lo necesita el selector de la ficha del
// cliente y el aviso del formulario de venta, no solo /settings).
//
// A diferencia de /api/credit-tiers, esto devuelve también las desactivadas: la
// pantalla de configuración las tiene que poder ver para reactivarlas. Quien
// muestra un selector filtra por `active`; quien decide el descuento de verdad
// es el servidor al crear la venta (resolveContactDiscount ignora las
// inactivas).
export async function GET() {
  const gate = await requireRole();
  if (!gate.success) return gate.response;

  try {
    const tags = await prisma.discountTag.findMany({
      orderBy: [{ active: "desc" }, { code: "asc" }],
      // `contacts` son los que la tienen como etiqueta general;
      // `contactProductDiscounts`, los acuerdos por producto que la usan. Hacen
      // falta los dos para poder avisar a cuanta gente le cambia el precio una
      // edicion: desde la Fase A una etiqueta se usa en los dos planos, y contar
      // solo uno subestima el alcance justo cuando mas importa.
      include: {
        _count: { select: { contacts: true, contactProductDiscounts: true } },
      },
    });
    return NextResponse.json(tags);
  } catch (error) {
    log.error({ err: error }, "Error fetching discount tags");
    return NextResponse.json({ error: "Error al obtener las etiquetas de descuento" }, { status: 500 });
  }
}

const createSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1),
  type: z.enum(DISCOUNT_TAG_TYPES),
  value: z.number().positive(),
});

// POST — SUPERADMIN, desde /settings.
export async function POST(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const body = await request.json();
    const validation = validateBody(createSchema, body);
    if (!validation.success) return validation.response;
    const data = validation.data;

    // Un porcentaje mayor a 100 dejaría la venta en cero: se acota igual al
    // calcular, pero es casi seguro un error de carga y conviene decirlo acá.
    if (data.type === "PERCENTAGE" && data.value > 100) {
      return NextResponse.json({ error: "Un descuento en porcentaje no puede pasar de 100" }, { status: 400 });
    }

    const existing = await prisma.discountTag.findUnique({ where: { code: data.code } });
    if (existing) {
      return NextResponse.json({ error: `Ya existe una etiqueta con código "${data.code}"` }, { status: 400 });
    }

    const tag = await prisma.discountTag.create({ data });

    await logOperatorAction({
      userId: session.user.id,
      action: "CREATE_DISCOUNT_TAG",
      entityType: "DISCOUNT_TAG",
      entityId: tag.id,
      description: `Creó etiqueta de descuento ${describeTag(tag)}`,
      link: "/settings",
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating discount tag");
    return NextResponse.json({ error: "Error al crear la etiqueta de descuento" }, { status: 500 });
  }
}
