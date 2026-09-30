import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logOperatorAction, notifyAdmins, escapeHtml } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/resellers");

/**
 * Revendedores: contactos `type: RESELLER`.
 *
 * Comercialmente son Clientes —compran, tienen cuenta corriente, portal y
 * descuentos pactados— pero se listan aparte y **no se cuentan como clientes
 * propios de Kristall**: le venden a talleres, y esos talleres son su cartera,
 * no la nuestra.
 *
 * ─── Qué comparten y qué no con /api/clients ───────────────────────────────
 *
 * Comparten **la ficha**: `/api/clients/[id]` abre para los dos tipos, y la
 * pantalla `/revendedores/[id]` reusa la de clientes. Eso es a propósito — un
 * revendedor tiene exactamente las mismas tarjetas (crédito, etiqueta,
 * descuentos pactados, cuenta corriente, portal) y duplicar 600 líneas para
 * cambiar un título es la clase de copia que después se separa.
 *
 * No comparten **el listado**: este devuelve solo RESELLER y `/api/clients`
 * solo CLIENT. Si el de clientes los incluyera, aparecerían duplicados en la
 * sección Clientes y el contador del dashboard dejaría de cuadrar con lo que se
 * ve en pantalla.
 *
 * Quién más los incluye está en `src/lib/contact-types.ts`.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limitParam = searchParams.get("limit");
    const isAll = limitParam === "all";
    const limit = isAll
      ? undefined
      : Math.min(100, Math.max(1, parseInt(limitParam || "30", 10)));

    const where: Prisma.ContactWhereInput = { type: "RESELLER" as const };
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { company: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [resellers, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...(isAll ? {} : { skip: (page - 1) * limit!, take: limit }),
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          email: true,
          phone: true,
          whatsapp: true,
          city: true,
          state: true,
          cuit: true,
          createdAt: true,
          discountTag: {
            select: { id: true, code: true, name: true, type: true, value: true, active: true },
          },
          // Cuántos descuentos pactados tiene cargados. Es lo que distingue a un
          // revendedor con acuerdos —que por la regla de resolveLineTag deja de
          // usar su etiqueta general— de uno que todavía no negoció nada.
          _count: { select: { productDiscounts: true, sales: true } },
        },
      }),
      prisma.contact.count({ where }),
    ]);

    return NextResponse.json({
      resellers,
      total,
      page,
      totalPages: isAll ? 1 : Math.ceil(total / limit!),
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching resellers");
    return NextResponse.json({ error: "Error al obtener revendedores" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await request.json();
    // `type` se fuerza acá y no se toma del body: esta ruta crea revendedores,
    // y aceptar el tipo del cliente la convertiría en un alta genérica de
    // contactos por la puerta de atrás.
    const reseller = await prisma.contact.create({
      data: { ...body, type: "RESELLER" as const },
      include: { assignedTo: { select: { id: true, name: true } } },
    });

    const nombre = reseller.company || `${reseller.firstName} ${reseller.lastName}`.trim();
    await logOperatorAction({
      userId: session.user.id,
      action: "RESELLER_CREATED",
      entityType: "CONTACT",
      entityId: reseller.id,
      description: `Creó el revendedor "${nombre}"`,
      link: "/revendedores",
    });

    if (session.user.role === "OPERATOR") {
      await notifyAdmins({
        type: "CLIENT_CREATED",
        title: "Nuevo revendedor creado",
        message: `<strong>${escapeHtml(session.user.name || "Operador")}</strong> creó el revendedor <strong>${escapeHtml(nombre)}</strong>.`,
        link: "/revendedores",
      });
    }

    return NextResponse.json(reseller, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating reseller");
    return NextResponse.json({ error: "Error al crear el revendedor" }, { status: 500 });
  }
}
