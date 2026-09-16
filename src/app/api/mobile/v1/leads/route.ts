import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction, notifyAdmins, escapeHtml } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mobile/v1/leads");

const SECTORS = [
  "AUTO_TALLER",
  "AUTO_CONCESIONARIO",
  "AUTO_MAYORISTA",
  "ARQUITECTURA_CONSTRUCTORA",
  "ARQUITECTURA_VIDRIERIA",
  "ARQUITECTURA_MAYORISTA",
] as const;

const createLeadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().optional(),
  sector: z.enum(SECTORS).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  cuit: z.string().optional(),
  notes: z.string().optional(),
  // Diagnóstico comercial del POS móvil: no tienen columna propia en Contact
  // (a propósito — se llenan una vez, en la visita), se guardan como una
  // única nota (LeadActivity NOTE) para no pedir un db:push por esto.
  monthlyCarVolume: z.string().optional(),
  filmBrandsUsed: z.string().optional(),
  currentSuppliers: z.string().optional(),
  rollPurchasePrices: z.string().optional(),
  improvementNeeds: z.string().optional(),
  logisticsIssues: z.string().optional(),
  // El vendedor ya vio los posibles duplicados y decidió crear igual.
  force: z.boolean().optional(),
});

type CreateLeadInput = z.infer<typeof createLeadSchema>;

const SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  company: true,
  phone: true,
  email: true,
  cuit: true,
  type: true,
} as const;

const DIAGNOSTIC_QUESTIONS: { key: keyof CreateLeadInput; label: string }[] = [
  { key: "monthlyCarVolume", label: "Autos por mes" },
  { key: "filmBrandsUsed", label: "Marcas de láminas que usa" },
  { key: "currentSuppliers", label: "Proveedores que tiene" },
  { key: "rollPurchasePrices", label: "Precios de compra de sus rollos" },
  { key: "improvementNeeds", label: "Qué necesita para mejorar" },
  { key: "logisticsIssues", label: "Qué errores hay en la logística actual de sus proveedores" },
];

function buildDiagnosticNote(data: CreateLeadInput): string | null {
  const lines = DIAGNOSTIC_QUESTIONS.map(({ key, label }) => {
    const value = data[key];
    return typeof value === "string" && value.trim() ? `${label}: ${value.trim()}` : null;
  }).filter((line): line is string => line !== null);
  return lines.length > 0 ? lines.join("\n") : null;
}

const LIST_SELECT = {
  id: true,
  leadNumber: true,
  firstName: true,
  lastName: true,
  company: true,
  sector: true,
  phone: true,
  whatsapp: true,
  email: true,
  city: true,
  contacted: true,
  createdAt: true,
} as const;

export function OPTIONS() {
  return mobileCorsPreflight();
}

// Buscador + filtros rápidos para la pantalla de "Leads" del POS móvil.
// Mismas 3 dimensiones más usadas del filtro del CRM web (contactado, mis
// leads, con dirección) — el resto (sector/ciudad/barrio/etiqueta) se dejó
// afuera a propósito: no entra bien en una fila de iconos en el celular.
export async function GET(request: Request) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const contactedParam = searchParams.get("contacted");

    const where: Prisma.ContactWhereInput = { type: "LEAD" };
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { company: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ];
    }
    if (contactedParam !== null) where.contacted = contactedParam === "true";
    if (searchParams.get("myLeads") === "1") where.assignedToId = gate.user.sub;
    if (searchParams.get("hasAddress") === "1") where.address = { not: null };

    const leads = await prisma.contact.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return withMobileCors(NextResponse.json({ leads }));
  } catch (error) {
    log.error({ err: error }, "Error searching leads");
    return withMobileCors(NextResponse.json({ error: "Error al buscar leads" }, { status: 500 }));
  }
}

// Alta de lead desde la ruta: mismas preguntas que el CRM guarda para
// cualquier contacto, más un diagnóstico comercial corto que se adjunta como
// nota en vez de sumar columnas nuevas.
export async function POST(request: Request) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  const json = await request.json().catch(() => null);
  const validation = validateBody(createLeadSchema, json);
  if (!validation.success) return withMobileCors(validation.response);
  const data = validation.data;
  const { firstName, lastName, company, email, sector, phone, whatsapp, address, city, state, cuit, notes, force } =
    data;

  try {
    // A diferencia del alta de clientes, acá se busca entre TODOS los tipos:
    // un taller que ya es CLIENT o INSTALLER no debería volver a entrar como
    // LEAD nuevo.
    if (!force) {
      const orClauses: Record<string, unknown>[] = [
        { AND: [{ firstName: firstName.trim() }, { lastName: lastName.trim() }] },
      ];
      if (phone?.trim()) orClauses.push({ phone: phone.trim() });
      if (company?.trim()) orClauses.push({ company: company.trim() });

      const duplicates = await prisma.contact.findMany({
        where: { OR: orClauses },
        select: SELECT,
        take: 5,
      });

      if (duplicates.length > 0) {
        return withMobileCors(
          NextResponse.json(
            {
              error:
                duplicates.length === 1
                  ? "Ya existe un contacto que coincide. Revisá si es el mismo."
                  : `Ya existen ${duplicates.length} contactos que coinciden. Revisá si alguno es el mismo.`,
              duplicates,
            },
            { status: 409 }
          )
        );
      }
    }

    const lead = await prisma.contact.create({
      data: {
        firstName,
        lastName,
        company,
        sector: sector || undefined,
        email: email || undefined,
        phone,
        whatsapp,
        address,
        city,
        state,
        cuit,
        notes,
        type: "LEAD",
        // Queda asignado a quien lo levantó en la calle, para que aparezca
        // en "Mis leads" sin que alguien tenga que repartirlo a mano.
        assignedToId: gate.user.sub,
      },
      select: SELECT,
    });

    const diagnosticNote = buildDiagnosticNote(data);
    if (diagnosticNote) {
      await prisma.leadActivity.create({
        data: {
          contactId: lead.id,
          userId: gate.user.sub,
          type: "NOTE",
          title: "Diagnóstico comercial (POS móvil)",
          description: diagnosticNote,
        },
      });
    }

    const contactName = lead.company || `${lead.firstName} ${lead.lastName}`.trim();
    await logOperatorAction({
      userId: gate.user.sub,
      action: "LEAD_CREATED",
      entityType: "LEAD",
      entityId: lead.id,
      description: `Agregó el lead "${contactName}" (app móvil)`,
      link: "/leads",
    });

    if (gate.user.role === "OPERATOR") {
      await notifyAdmins({
        type: "LEAD_CREATED",
        title: "Nuevo lead agregado",
        message: `<strong>${escapeHtml(gate.user.name)}</strong> agregó el lead <strong>${escapeHtml(contactName)}</strong> desde el POS móvil.`,
        link: "/leads",
      });
    }

    return withMobileCors(NextResponse.json({ lead }, { status: 201 }));
  } catch (error) {
    log.error({ err: error }, "Error creating lead");
    return withMobileCors(NextResponse.json({ error: "Error al crear el lead" }, { status: 500 }));
  }
}
