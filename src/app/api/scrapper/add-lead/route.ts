import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/scrapper/add-lead");

const SCRAPP_TAG = { name: "Scrapp", color: "#f97316" }; // orange

const addLeadSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  company: z.string().min(1).max(200),
  phone: z.string().max(50).nullable().optional(),
  whatsapp: z.string().max(50).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  sector: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  log.info({ userId: session?.user?.id }, "Solicitud recibida");
  if (!session?.user?.id) {
    log.error({}, "No autorizado - no hay sesión");
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const raw = await request.json();
    log.info({ raw }, "Body recibido");
    const parsed = validateBody(addLeadSchema, raw);
    if (!parsed.success) {
      log.warn({ errors: parsed.response }, "Validación fallida");
      return parsed.response;
    }
    const body = parsed.data;
    log.info({ body }, "Body válido");

    // Check for existing lead with same company name (fuzzy)
    const normalized = body.company.toLowerCase().replace(/[^a-záéíóúüñ0-9\s]/gi, "").replace(/\s+/g, " ").trim();
    log.info({ normalized, originalCompany: body.company }, "Empresa normalizada");
    if (normalized && normalized.length > 2) { // Only check if normalized is meaningful (> 2 chars)
      const existing = await prisma.contact.findMany({
        where: { type: "LEAD", company: { not: null } },
        select: { id: true, company: true },
      });
      log.info({ existingCount: existing.length }, "Leads existentes obtenidos");
      const match = existing.find((e) => {
        const en = (e.company ?? "").toLowerCase().replace(/[^a-záéíóúüñ0-9\s]/gi, "").replace(/\s+/g, " ").trim();
        // Only compare if both normalized values are meaningful (> 2 chars)
        if (!en || en.length < 3) return false;
        return en === normalized || (en.includes(normalized) && normalized.includes(en.substring(0, Math.max(3, Math.floor(en.length * 0.7)))));
      });
      if (match) {
        log.info({ matchCompany: match.company, normalized }, "Duplicado encontrado");
        return NextResponse.json(
          { error: `Ya existe un lead similar: "${match.company}"` },
          { status: 409 }
        );
      }
    }

    // Find or create the "Scrapp" tag
    const tag = await prisma.tag.upsert({
      where: { name: SCRAPP_TAG.name },
      update: {},
      create: SCRAPP_TAG,
    });
    log.info({ tagId: tag.id }, "Tag procesado");

    // Create the lead and link the tag
    const lead = await prisma.contact.create({
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        company: body.company,
        phone: body.phone ?? null,
        whatsapp: body.whatsapp ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        website: body.website ?? null,
        sector: body.sector ?? null,
        notes: body.notes ?? null,
        type: "LEAD" as const,
        tags: {
          create: { tagId: tag.id },
        },
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        tags: { include: { tag: true } },
      },
    });
    log.info({ leadId: lead.id }, "Lead creado exitosamente");

    await logOperatorAction({
      userId: session.user.id,
      action: "CREATE_LEAD_SCRAPPER",
      entityType: "LEAD",
      entityId: lead.id,
      description: `Creó lead "${body.company}" desde Scrapper`,
      link: `/leads/${lead.id}`,
    });

    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error adding scrapp lead");
    return NextResponse.json({ error: "Error al agregar lead" }, { status: 500 });
  }
}
