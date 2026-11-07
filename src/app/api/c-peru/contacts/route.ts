import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/c-peru/contacts");

// Tope de la lista: es una herramienta de prospección, no un archivo histórico.
const LIST_LIMIT = 2000;

const optionalText = (max: number) => z.string().max(max).nullable().optional();

const contactSchema = z.object({
  placeId: optionalText(200),
  name: z.string().trim().min(1).max(200),
  category: optionalText(60),
  address: optionalText(300),
  district: optionalText(100),
  city: optionalText(100),
  department: optionalText(100),
  phone: optionalText(30),
  whatsapp: optionalText(30),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
  website: optionalText(300),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  ratingsTotal: z.number().int().min(0).nullable().optional(),
});

const bodySchema = z.object({ contacts: z.array(contactSchema).min(1).max(300) });

const blankToNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export async function GET(request: Request) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const department = searchParams.get("department")?.trim();
  const onlyWhatsApp = searchParams.get("whatsapp") === "1";
  const onlyEmail = searchParams.get("email") === "1";
  const contacted = searchParams.get("contacted");

  const where: Prisma.PeruContactWhereInput = {};
  if (department) where.department = department;
  if (onlyWhatsApp) where.whatsapp = { not: null };
  if (onlyEmail) where.email = { not: null };
  if (contacted === "1") where.contacted = true;
  if (contacted === "0") where.contacted = false;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { phone: { contains: q.replace(/\D/g, "") || q } },
      { email: { contains: q } },
      { city: { contains: q } },
      { district: { contains: q } },
    ];
  }

  const [contacts, total] = await Promise.all([
    prisma.peruContact.findMany({ where, orderBy: { createdAt: "desc" }, take: LIST_LIMIT }),
    prisma.peruContact.count({ where }),
  ]);

  return NextResponse.json({ contacts, total, truncated: total > contacts.length });
}

const bulkContactedSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(500),
  contacted: z.boolean(),
});

/** Marca varios contactos como contactados (o pendientes) de una vez, tras un envío masivo. */
export async function PATCH(request: Request) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;

  const parsed = validateBody(bulkContactedSchema, await request.json().catch(() => null));
  if (!parsed.success) return parsed.response;

  try {
    const { count } = await prisma.peruContact.updateMany({
      where: { id: { in: parsed.data.ids } },
      data: { contacted: parsed.data.contacted },
    });
    return NextResponse.json({ updated: count });
  } catch (err) {
    log.error({ err }, "Error al actualizar contactos de Perú en lote");
    return NextResponse.json({ error: "Error al actualizar los contactos" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;
  const { session } = gate;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const parsed = validateBody(bodySchema, raw);
  if (!parsed.success) return parsed.response;

  try {
    // Lo que ya está guardado se saltea: por placeId o por el mismo teléfono.
    const incoming = parsed.data.contacts;
    const existing = await prisma.peruContact.findMany({
      where: {
        OR: [
          { placeId: { in: incoming.map((c) => c.placeId).filter((v): v is string => !!v) } },
          { phone: { in: incoming.map((c) => blankToNull(c.phone)).filter((v): v is string => !!v) } },
        ],
      },
      select: { placeId: true, phone: true },
    });
    const knownPlaceIds = new Set(existing.map((e) => e.placeId).filter(Boolean));
    const knownPhones = new Set(existing.map((e) => e.phone).filter(Boolean));

    const fresh = incoming.filter((c) => {
      const phone = blankToNull(c.phone);
      if (c.placeId && knownPlaceIds.has(c.placeId)) return false;
      if (phone && knownPhones.has(phone)) return false;
      // Dentro del mismo lote tampoco se repite.
      if (c.placeId) knownPlaceIds.add(c.placeId);
      if (phone) knownPhones.add(phone);
      return true;
    });

    if (fresh.length > 0) {
      await prisma.peruContact.createMany({
        data: fresh.map((c) => ({
          placeId: blankToNull(c.placeId),
          name: c.name,
          category: blankToNull(c.category),
          address: blankToNull(c.address),
          district: blankToNull(c.district),
          city: blankToNull(c.city),
          department: blankToNull(c.department),
          phone: blankToNull(c.phone),
          whatsapp: blankToNull(c.whatsapp),
          email: blankToNull(c.email),
          website: blankToNull(c.website),
          lat: c.lat ?? null,
          lng: c.lng ?? null,
          rating: c.rating ?? null,
          ratingsTotal: c.ratingsTotal ?? null,
          createdById: session.user.id,
        })),
        skipDuplicates: true,
      });

      await logOperatorAction({
        userId: session.user.id,
        action: "CREATE_PERU_CONTACTS",
        entityType: "PERU_CONTACT",
        description:
          fresh.length === 1
            ? `Guardó "${fresh[0].name}" en Contactos Perú`
            : `Guardó ${fresh.length} contactos en Contactos Perú`,
        link: "/c-peru",
      });
    }

    return NextResponse.json(
      {
        created: fresh.length,
        duplicates: incoming.length - fresh.length,
        // Los que se guardaron, para que la pantalla los marque sin volver a buscar.
        savedPlaceIds: fresh.map((c) => c.placeId).filter(Boolean),
      },
      { status: 201 }
    );
  } catch (err) {
    log.error({ err }, "Error al guardar contactos de Perú");
    return NextResponse.json({ error: "Error al guardar los contactos" }, { status: 500 });
  }
}
