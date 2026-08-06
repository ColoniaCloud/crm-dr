import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/locations");

// GET /api/locations — ADMIN+. Listado de las 4 ubicaciones de custodia de
// rollos: Depósito y Local (singleton) más todos los Puntos de Reventa
// (uno por instalador consignado). Usado para armar el selector de destino
// al mover un rollo y la pantalla de alta de Puntos de Reventa.
export async function GET(request: Request) {
  const gate = await requireRole(["ADMIN", "SUPERADMIN"]);
  if (!gate.success) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const activeParam = searchParams.get("active");

    const locations = await prisma.location.findMany({
      where: {
        ...(type ? { type: type as "DEPOSITO" | "LOCAL" | "PUNTO_REVENTA" } : {}),
        ...(activeParam === "false" ? { active: false } : activeParam === "all" ? {} : { active: true }),
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, company: true } },
        _count: { select: { rolls: { where: { status: "IN_STOCK" } } } },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(locations);
  } catch (error) {
    log.error({ err: error }, "Error fetching locations");
    return NextResponse.json({ error: "Error al obtener ubicaciones" }, { status: 500 });
  }
}

const createLocationSchema = z.object({
  type: z.enum(["DEPOSITO", "LOCAL", "PUNTO_REVENTA"]),
  name: z.string().min(1),
  contactId: z.string().min(1).optional(),
});

// POST /api/locations — SUPERADMIN. Depósito y Local son singleton (ya
// sembrados por prisma/seed-locations.ts) y no se pueden volver a crear.
// Punto de Reventa requiere un contactId de tipo CLIENT — es el taller del
// instalador donde vive el stock consignado.
export async function POST(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const body = await request.json();
    const validation = validateBody(createLocationSchema, body);
    if (!validation.success) return validation.response;
    const { type, name, contactId } = validation.data;

    if (type !== "PUNTO_REVENTA") {
      const existing = await prisma.location.findFirst({ where: { type } });
      if (existing) {
        return NextResponse.json(
          { error: `Ya existe una ubicación de tipo ${type} — es única, no se puede crear otra` },
          { status: 400 }
        );
      }
    }

    if (type === "PUNTO_REVENTA") {
      if (!contactId) {
        return NextResponse.json(
          { error: "Un Punto de Reventa necesita el contactId del instalador al que pertenece" },
          { status: 400 }
        );
      }
      const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { type: true } });
      if (!contact || contact.type !== "CLIENT") {
        return NextResponse.json(
          { error: "El contacto indicado no existe o no es de tipo Cliente" },
          { status: 400 }
        );
      }
    }

    const location = await prisma.location.create({
      data: {
        type,
        name,
        contactId: type === "PUNTO_REVENTA" ? contactId : null,
      },
      include: { contact: { select: { id: true, firstName: true, lastName: true, company: true } } },
    });

    await logOperatorAction({
      userId: session.user.id,
      action: "CREATE_LOCATION",
      entityType: "LOCATION",
      entityId: location.id,
      description: `Creó ubicación "${location.name}" (${location.type})`,
    });

    return NextResponse.json(location, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating location");
    return NextResponse.json({ error: "Error al crear la ubicación" }, { status: 500 });
  }
}
