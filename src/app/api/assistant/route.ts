import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import type { AssistantApiResponse, AssistantNavigateAction, AssistantTableAction, AssistantCampaignAction } from "@/types/assistant";

const log = createLogger("api/assistant");
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `Eres un asistente de CRM para Dr. Polarizados, empresa de láminas de polarizado (automotriz, arquitectónico y PPF). Ayudás a los usuarios a navegar el sistema y a consultar/gestionar datos en tiempo real.

SECCIONES DEL CRM:
- /leads → Prospectos/leads (se pueden filtrar)
- /clients → Clientes activos
- /installers → Base de datos de instaladores
- /calendar/calls → Calendario de llamadas
- /calendar/visits → Calendario de visitas
- /sales → Ventas realizadas
- /quotes → Presupuestos
- /products → Productos y stock
- /payments → Pagos
- /purchase-orders → Órdenes de compra
- /suppliers → Proveedores
- /competitors → Competencia
- /activities → Actividad de operadores
- /whatsapp → Módulo WhatsApp

TIPOS DE CONTACTO: LEAD (prospecto), CLIENT (cliente), INSTALLER (instalador)

SECTORES VÁLIDOS: AUTO_TALLER, AUTO_CONCESIONARIO, AUTO_MAYORISTA, ARQUITECTURA_CONSTRUCTORA, ARQUITECTURA_VIDRIERIA, ARQUITECTURA_MAYORISTA

FILTROS DISPONIBLES PARA LEADS (solo cuando navegás a /leads):
- filterContacted: true = ya contactados | false = no contactados
- filterCity: ciudad exacta
- filterState: provincia
- filterSector: uno de los sectores válidos
- search: texto libre

REGLAS PARA GESTIÓN DE DATOS:
- Para crear contactos, necesitás MÍNIMO firstName y lastName.
- Para agregar productos, necesitás nombre y precio.
- Para modificar stock, necesitás el nombre/ID del producto y la cantidad de ajuste.
- Para campañas de WhatsApp: solo SUPERADMIN puede enviar. Ayudá al usuario a redactar mensajes profesionales y con el tono adecuado antes de ejecutar.
- Cuando el usuario sube un CSV para importar contactos, analizá las columnas y confirmá antes de importar.

Respondé siempre en español, de forma concisa y amigable. Si el usuario pide algo no disponible, explicalo brevemente.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "navigate_section",
    description: "Navega al usuario a una sección del CRM. Usá este tool para cualquier pedido de navegación, con o sin filtros.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Ruta de destino en el CRM",
          enum: [
            "/leads", "/clients", "/installers", "/calendar/calls",
            "/calendar/visits", "/sales", "/quotes", "/products",
            "/payments", "/purchase-orders", "/suppliers",
            "/competitors", "/activities", "/whatsapp",
          ],
        },
        message: { type: "string", description: "Mensaje breve confirmando adónde vas a llevar al usuario." },
        leads_filters: {
          type: "object",
          description: "Filtros para pre-aplicar en /leads.",
          properties: {
            filterContacted: { type: "boolean" },
            filterCity: { type: "string" },
            filterState: { type: "string" },
            filterSector: { type: "string" },
            search: { type: "string" },
          },
        },
      },
      required: ["path", "message"],
    },
  },
  {
    name: "query_data",
    description: "Consulta la base de datos para responder preguntas de negocio (ventas, leads, clientes, presupuestos).",
    input_schema: {
      type: "object",
      properties: {
        query_type: {
          type: "string",
          enum: ["sales_this_month", "sales_last_month", "leads_total", "leads_not_contacted", "clients_total", "pending_quotes"],
        },
      },
      required: ["query_type"],
    },
  },
  {
    name: "search_contacts",
    description: "Busca contactos (leads, clientes o instaladores) y muestra la información detallada en el chat. Usá cuando el usuario pide info de un contacto.",
    input_schema: {
      type: "object",
      properties: {
        contact_type: {
          type: "string",
          enum: ["LEAD", "CLIENT", "INSTALLER", "ALL"],
          description: "Tipo de contacto a buscar. ALL para buscar en todos.",
        },
        search: { type: "string", description: "Nombre, empresa, email o teléfono a buscar." },
        message: { type: "string", description: "Mensaje al usuario mientras se muestra el resultado." },
      },
      required: ["contact_type", "search", "message"],
    },
  },
  {
    name: "create_contact",
    description: "Crea un nuevo contacto (lead, cliente o instalador). Usá cuando el usuario quiere agregar un contacto.",
    input_schema: {
      type: "object",
      properties: {
        contact_type: { type: "string", enum: ["LEAD", "CLIENT", "INSTALLER"] },
        firstName: { type: "string" },
        lastName: { type: "string" },
        company: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        whatsapp: { type: "string" },
        sector: { type: "string", description: "Solo para LEAD: AUTO_TALLER, AUTO_CONCESIONARIO, etc." },
        installerCountry: { type: "string", description: "Solo para INSTALLER: Argentina o Uruguay." },
        installerProvince: { type: "string" },
        message: { type: "string", description: "Mensaje de confirmación al usuario." },
      },
      required: ["contact_type", "firstName", "lastName", "message"],
    },
  },
  {
    name: "copy_lead_to_installer",
    description: "Copia un lead existente como instalador. Útil cuando un lead también trabaja como instalador.",
    input_schema: {
      type: "object",
      properties: {
        lead_search: { type: "string", description: "Nombre, email o teléfono del lead a copiar." },
        message: { type: "string", description: "Mensaje de confirmación al usuario." },
      },
      required: ["lead_search", "message"],
    },
  },
  {
    name: "convert_lead_to_client",
    description: "Convierte un lead existente en cliente.",
    input_schema: {
      type: "object",
      properties: {
        lead_search: { type: "string", description: "Nombre, email o teléfono del lead a convertir." },
        message: { type: "string", description: "Mensaje de confirmación al usuario." },
      },
      required: ["lead_search", "message"],
    },
  },
  {
    name: "import_contacts_csv",
    description: "Importa contactos desde un CSV. El contenido CSV ya fue parseado por el frontend. Analizá las filas y si están OK, importalas; si no, explicá qué está mal.",
    input_schema: {
      type: "object",
      properties: {
        contact_type: { type: "string", enum: ["LEAD", "CLIENT", "INSTALLER"] },
        csv_rows: {
          type: "array",
          description: "Filas del CSV ya parseadas.",
          items: { type: "object" },
        },
        message: { type: "string" },
      },
      required: ["contact_type", "csv_rows", "message"],
    },
  },
  {
    name: "search_products",
    description: "Busca productos y muestra una tabla con stock, precio y categoría en el chat.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Nombre, categoría, SKU o marca a buscar. Vacío para todos los productos activos." },
        message: { type: "string", description: "Mensaje al usuario." },
      },
      required: ["message"],
    },
  },
  {
    name: "create_product",
    description: "Crea un nuevo producto en el catálogo. Requiere nombre y precio mínimo.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        price: { type: "number" },
        cost: { type: "number" },
        stock: { type: "number" },
        minStock: { type: "number" },
        category: { type: "string", enum: ["AUTOMOTIVE", "ARCHITECTURAL", "PPF", "OTROS"] },
        subcategory: { type: "string" },
        brand: { type: "string" },
        sku: { type: "string" },
        unit: { type: "string" },
        description: { type: "string" },
        message: { type: "string", description: "Mensaje de confirmación." },
      },
      required: ["name", "price", "message"],
    },
  },
  {
    name: "update_stock",
    description: "Ajusta el stock de un producto. Puede ser un ajuste positivo (entrada) o negativo (salida).",
    input_schema: {
      type: "object",
      properties: {
        product_search: { type: "string", description: "Nombre o SKU del producto." },
        quantity: { type: "number", description: "Cantidad a ajustar (positivo = entrada, negativo = salida)." },
        reason: { type: "string", description: "Motivo del ajuste." },
        message: { type: "string", description: "Mensaje de confirmación." },
      },
      required: ["product_search", "quantity", "message"],
    },
  },
  {
    name: "plan_whatsapp_campaign",
    description: "Planifica y lanza una campaña de WhatsApp a leads, clientes o instaladores. Ayudá al usuario a redactar un mensaje profesional antes de ejecutar. Verificá la cantidad de destinatarios antes de confirmar.",
    input_schema: {
      type: "object",
      properties: {
        contact_type: { type: "string", enum: ["LEAD", "CLIENT", "INSTALLER"] },
        message: { type: "string", description: "Mensaje de WhatsApp a enviar." },
        delay_seconds: { type: "number", description: "Segundos de espera entre mensajes. Mínimo 2, máximo 10. Default 3." },
        assistant_message: { type: "string", description: "Mensaje al usuario explicando la campaña." },
      },
      required: ["contact_type", "message", "assistant_message"],
    },
  },
  {
    name: "answer_only",
    description: "Responde con texto plano sin navegar ni consultar datos.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
      required: ["message"],
    },
  },
];

const SECTION_LABELS: Record<string, string> = {
  "/leads": "Ir a Leads",
  "/clients": "Ir a Clientes",
  "/installers": "Ir a Instaladores",
  "/calendar/calls": "Ir a Llamadas",
  "/calendar/visits": "Ir a Visitas",
  "/sales": "Ir a Ventas",
  "/quotes": "Ir a Presupuestos",
  "/products": "Ir a Productos",
  "/payments": "Ir a Pagos",
  "/purchase-orders": "Ir a Órdenes de Compra",
  "/suppliers": "Ir a Proveedores",
  "/competitors": "Ir a Competencia",
  "/activities": "Ir a Actividades",
  "/whatsapp": "Ir a WhatsApp",
};

async function executeDataQuery(queryType: string): Promise<string> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  switch (queryType) {
    case "sales_this_month": {
      const sales = await prisma.sale.findMany({ where: { createdAt: { gte: startOfMonth } }, select: { total: true } });
      const total = sales.reduce((s, x) => s + Number(x.total), 0);
      return `${sales.length} ventas este mes por un total de $${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS.`;
    }
    case "sales_last_month": {
      const sales = await prisma.sale.findMany({ where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } }, select: { total: true } });
      const total = sales.reduce((s, x) => s + Number(x.total), 0);
      return `${sales.length} ventas el mes pasado por un total de $${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS.`;
    }
    case "leads_total": {
      const count = await prisma.contact.count({ where: { type: "LEAD" } });
      return `Hay ${count} leads registrados en el sistema.`;
    }
    case "leads_not_contacted": {
      const count = await prisma.contact.count({ where: { type: "LEAD", contacted: false } });
      return `Hay ${count} leads que aún no fueron contactados.`;
    }
    case "clients_total": {
      const count = await prisma.contact.count({ where: { type: "CLIENT" } });
      return `Hay ${count} clientes activos en el sistema.`;
    }
    case "pending_quotes": {
      const count = await prisma.quote.count({ where: { status: { in: ["DRAFT", "SENT"] } } });
      return `Hay ${count} presupuestos pendientes (en borrador o enviados sin respuesta).`;
    }
    default:
      return "No tengo esa consulta disponible.";
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json<AssistantApiResponse>({ message: "", error: "No autorizado" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json<AssistantApiResponse>({ message: "", error: "ANTHROPIC_API_KEY no configurada" }, { status: 503 });
  }

  try {
    const { message, history = [], csvRows, csvContactType } = await req.json() as {
      message: string;
      history: { role: "user" | "assistant"; content: string }[];
      csvRows?: Record<string, string>[];
      csvContactType?: string;
    };

    const userContent = csvRows?.length
      ? `${message}\n\n[CSV adjunto con ${csvRows.length} filas. Tipo: ${csvContactType || "LEAD"}. Columnas: ${Object.keys(csvRows[0] || {}).join(", ")}. Primeras 3 filas: ${JSON.stringify(csvRows.slice(0, 3))}]`
      : message;

    const messages: Anthropic.MessageParam[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: userContent },
    ];

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1536,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");

    if (!toolBlock || toolBlock.type !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return NextResponse.json<AssistantApiResponse>({
        message: textBlock?.type === "text" ? textBlock.text : "¿Podés reformular tu consulta?",
      });
    }

    const input = toolBlock.input as Record<string, unknown>;

    // ── navigate_section ──────────────────────────────────────────────────────
    if (toolBlock.name === "navigate_section") {
      const path = input.path as string;
      const msg = input.message as string;
      const leadsFilters = input.leads_filters as Record<string, unknown> | undefined;

      const action: AssistantNavigateAction = { type: "navigate", path, label: SECTION_LABELS[path] ?? "Ir allá" };

      if (path === "/leads" && leadsFilters && Object.keys(leadsFilters).length > 0) {
        action.sessionStorageKey = "leads-filters";
        action.sessionStorageValue = JSON.stringify(leadsFilters);
      }

      return NextResponse.json<AssistantApiResponse>({ message: msg, action });
    }

    // ── query_data ────────────────────────────────────────────────────────────
    if (toolBlock.name === "query_data") {
      const dataResult = await executeDataQuery(input.query_type as string);

      const followUp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [
          ...messages,
          { role: "assistant" as const, content: response.content },
          { role: "user" as const, content: [{ type: "tool_result" as const, tool_use_id: toolBlock.id, content: dataResult }] },
        ],
      });

      const text = followUp.content.find((b) => b.type === "text");
      return NextResponse.json<AssistantApiResponse>({ message: text?.type === "text" ? text.text : dataResult });
    }

    // ── search_contacts ───────────────────────────────────────────────────────
    if (toolBlock.name === "search_contacts") {
      const contactType = input.contact_type as string;
      const search = (input.search as string || "").trim();
      const msg = input.message as string;

      const where: Record<string, unknown> = {};
      if (contactType !== "ALL") where.type = contactType;
      if (search) {
        where.OR = [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { company: { contains: search } },
          { email: { contains: search } },
          { phone: { contains: search } },
          { whatsapp: { contains: search } },
        ];
      }

      const contacts = await prisma.contact.findMany({
        where,
        take: 20,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, type: true, firstName: true, lastName: true,
          company: true, email: true, phone: true, whatsapp: true,
          sector: true, state: true, city: true,
          installerCountry: true, installerProvince: true,
        },
      });

      if (contacts.length === 0) {
        return NextResponse.json<AssistantApiResponse>({ message: `${msg}\n\nNo encontré contactos con esos criterios.` });
      }

      const action: AssistantTableAction = {
        type: "table",
        title: `Contactos encontrados (${contacts.length})`,
        columns: ["Tipo", "Nombre", "Empresa", "Email", "Teléfono", "Sector / País"],
        rows: contacts.map((c) => ({
          Tipo: c.type === "LEAD" ? "Lead" : c.type === "CLIENT" ? "Cliente" : "Instalador",
          Nombre: `${c.firstName} ${c.lastName}`.trim(),
          Empresa: c.company || "-",
          Email: c.email || "-",
          Teléfono: c.phone || c.whatsapp || "-",
          "Sector / País": c.sector ? c.sector.replace(/_/g, " ") : (c.installerCountry || c.state || "-"),
        })),
      };

      return NextResponse.json<AssistantApiResponse>({ message: msg, action });
    }

    // ── create_contact ────────────────────────────────────────────────────────
    if (toolBlock.name === "create_contact") {
      const contactType = input.contact_type as string;
      const msg = input.message as string;

      const contact = await prisma.contact.create({
        data: {
          type: contactType as "LEAD" | "CLIENT" | "INSTALLER",
          firstName: (input.firstName as string || "").trim(),
          lastName: (input.lastName as string || "").trim(),
          company: (input.company as string || null) || null,
          phone: (input.phone as string || null) || null,
          email: (input.email as string || null) || null,
          whatsapp: (input.whatsapp as string || null) || null,
          sector: (input.sector as string || null) || null,
          installerCountry: (input.installerCountry as string || null) || null,
          installerProvince: (input.installerProvince as string || null) || null,
          hasLocalStore: false,
        },
      });

      await logOperatorAction({
        userId: session.user.id,
        action: "CREATE_CONTACT",
        entityType: contactType,
        entityId: contact.id,
        description: `Asistente IA creó contacto "${contact.firstName} ${contact.lastName}" como ${contactType}`,
      });

      return NextResponse.json<AssistantApiResponse>({ message: `${msg}\n\n✅ Contacto creado correctamente con ID: ${contact.id}` });
    }

    // ── copy_lead_to_installer ────────────────────────────────────────────────
    if (toolBlock.name === "copy_lead_to_installer") {
      const search = (input.lead_search as string || "").trim();
      const msg = input.message as string;

      const lead = await prisma.contact.findFirst({
        where: {
          type: "LEAD",
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
          ],
        },
      });

      if (!lead) {
        return NextResponse.json<AssistantApiResponse>({ message: `No encontré ningún lead con "${search}". Revisá el nombre o teléfono e intentá de nuevo.` });
      }

      const installer = await prisma.contact.create({
        data: {
          type: "INSTALLER",
          firstName: lead.firstName,
          lastName: lead.lastName,
          company: lead.company,
          phone: lead.phone,
          email: lead.email,
          whatsapp: lead.whatsapp,
          hasLocalStore: false,
        },
      });

      await logOperatorAction({
        userId: session.user.id,
        action: "INSTALLER_CREATED",
        entityType: "INSTALLER",
        entityId: installer.id,
        description: `Asistente IA copió lead "${lead.firstName} ${lead.lastName}" como instalador`,
        link: "/installers",
      });

      return NextResponse.json<AssistantApiResponse>({
        message: `${msg}\n\n✅ Lead **${lead.firstName} ${lead.lastName}** copiado como instalador correctamente.`,
      });
    }

    // ── convert_lead_to_client ────────────────────────────────────────────────
    if (toolBlock.name === "convert_lead_to_client") {
      const search = (input.lead_search as string || "").trim();
      const msg = input.message as string;

      const lead = await prisma.contact.findFirst({
        where: {
          type: "LEAD",
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
          ],
        },
      });

      if (!lead) {
        return NextResponse.json<AssistantApiResponse>({ message: `No encontré ningún lead con "${search}". Revisá el nombre o teléfono.` });
      }

      await prisma.contact.update({ where: { id: lead.id }, data: { type: "CLIENT" } });

      await logOperatorAction({
        userId: session.user.id,
        action: "LEAD_CONVERTED",
        entityType: "CLIENT",
        entityId: lead.id,
        description: `Asistente IA convirtió lead "${lead.firstName} ${lead.lastName}" a cliente`,
        link: `/clients`,
      });

      return NextResponse.json<AssistantApiResponse>({
        message: `${msg}\n\n✅ **${lead.firstName} ${lead.lastName}** fue convertido a cliente correctamente.`,
      });
    }

    // ── import_contacts_csv ───────────────────────────────────────────────────
    if (toolBlock.name === "import_contacts_csv") {
      const contactType = input.contact_type as string;
      const csvRowsRaw = (input.csv_rows as Record<string, string>[]) || [];
      const msg = input.message as string;

      if (csvRowsRaw.length === 0) {
        return NextResponse.json<AssistantApiResponse>({ message: "No recibí filas del CSV. Adjuntá el archivo CSV en el chat." });
      }

      const hasNames = csvRowsRaw.every((r) => r.firstName || r.nombre || r.lastName || r.apellido || r.company || r.empresa);
      if (!hasNames) {
        const cols = Object.keys(csvRowsRaw[0] || {}).join(", ");
        return NextResponse.json<AssistantApiResponse>({
          message: `El CSV no tiene las columnas requeridas. Encontré: **${cols}**.\n\nNecesito al menos: \`firstName\` (nombre) y \`lastName\` (apellido). También acepto: \`phone\`, \`email\`, \`whatsapp\`, \`company\`.`,
        });
      }

      const endpoint = contactType === "INSTALLER" ? "/api/installers/import-csv" : "/api/leads/import";
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

      const importRes = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": req.headers.get("cookie") || "",
        },
        body: JSON.stringify({ rows: csvRowsRaw }),
      });

      const importData = await importRes.json() as { imported?: number; error?: string };

      if (!importRes.ok || importData.error) {
        return NextResponse.json<AssistantApiResponse>({ message: `Error al importar: ${importData.error || "Error desconocido"}` });
      }

      return NextResponse.json<AssistantApiResponse>({
        message: `${msg}\n\n✅ Se importaron **${importData.imported}** contactos correctamente como ${contactType === "INSTALLER" ? "instaladores" : contactType === "CLIENT" ? "clientes" : "leads"}.`,
      });
    }

    // ── search_products ───────────────────────────────────────────────────────
    if (toolBlock.name === "search_products") {
      const search = (input.search as string || "").trim();
      const msg = input.message as string;

      const where: Record<string, unknown> = { active: true };
      if (search) {
        where.OR = [
          { name: { contains: search } },
          { brand: { contains: search } },
          { sku: { contains: search } },
          { subcategory: { contains: search } },
          { category: { contains: search } },
        ];
      }

      const products = await prisma.product.findMany({
        where,
        take: 30,
        orderBy: { name: "asc" },
        select: { id: true, name: true, category: true, subcategory: true, brand: true, sku: true, price: true, stock: true, minStock: true },
      });

      if (products.length === 0) {
        return NextResponse.json<AssistantApiResponse>({ message: `${msg}\n\nNo encontré productos con esos criterios.` });
      }

      const action: AssistantTableAction = {
        type: "table",
        title: `Productos (${products.length})`,
        columns: ["Nombre", "Categoría", "Marca", "SKU", "Precio", "Stock", "Stock mín."],
        rows: products.map((p) => ({
          Nombre: p.name,
          Categoría: p.subcategory || p.category || "-",
          Marca: p.brand || "-",
          SKU: p.sku || "-",
          Precio: `$${Number(p.price).toLocaleString("es-AR")}`,
          Stock: p.stock != null ? String(p.stock) : "0",
          "Stock mín.": p.minStock != null ? String(p.minStock) : "0",
        })),
      };

      return NextResponse.json<AssistantApiResponse>({ message: msg, action });
    }

    // ── create_product ────────────────────────────────────────────────────────
    if (toolBlock.name === "create_product") {
      const msg = input.message as string;

      const rawCategory = (input.category as string || "AUTOMOTIVE").toUpperCase();
      const validCategories = ["AUTOMOTIVE", "ARCHITECTURAL", "PPF"];
      const category = validCategories.includes(rawCategory) ? rawCategory : "AUTOMOTIVE";

      const product = await prisma.product.create({
        data: {
          name: (input.name as string).trim(),
          price: Number(input.price) || 0,
          cost: input.cost != null ? Number(input.cost) : null,
          stock: input.stock != null ? Number(input.stock) : 0,
          minStock: input.minStock != null ? Number(input.minStock) : 0,
          category: category as "AUTOMOTIVE" | "ARCHITECTURAL" | "PPF",
          subcategory: (input.subcategory as string || null) || null,
          brand: (input.brand as string || null) || null,
          sku: (input.sku as string || null) || null,
          description: (input.description as string || null) || null,
          active: true,
        },
      });

      await logOperatorAction({
        userId: session.user.id,
        action: "CREATE_PRODUCT",
        entityType: "PRODUCT",
        entityId: product.id,
        description: `Asistente IA creó producto "${product.name}"`,
        link: `/products/${product.id}`,
      });

      return NextResponse.json<AssistantApiResponse>({
        message: `${msg}\n\n✅ Producto **${product.name}** creado con precio $${Number(product.price).toLocaleString("es-AR")} y stock inicial ${product.stock ?? 0}.`,
      });
    }

    // ── update_stock ──────────────────────────────────────────────────────────
    if (toolBlock.name === "update_stock") {
      const search = (input.product_search as string || "").trim();
      const quantity = Number(input.quantity);
      const reason = (input.reason as string || "Ajuste via Asistente IA").trim();
      const msg = input.message as string;

      if (isNaN(quantity) || quantity === 0) {
        return NextResponse.json<AssistantApiResponse>({ message: "La cantidad de ajuste debe ser un número distinto de cero." });
      }

      const product = await prisma.product.findFirst({
        where: {
          active: true,
          OR: [{ name: { contains: search } }, { sku: { contains: search } }],
        },
      });

      if (!product) {
        return NextResponse.json<AssistantApiResponse>({ message: `No encontré ningún producto con "${search}".` });
      }

      const stockBefore = product.stock ?? 0;
      const newStock = Math.max(0, stockBefore + quantity);
      const movType = quantity > 0 ? "ENTRADA" : quantity < 0 ? "SALIDA" : "AJUSTE";

      await prisma.$transaction([
        prisma.product.update({ where: { id: product.id }, data: { stock: newStock } }),
        prisma.stockMovement.create({
          data: {
            productId: product.id,
            type: movType,
            quantity: Math.abs(quantity),
            stockBefore,
            stockAfter: newStock,
            reason,
            userId: session.user.id,
          },
        }),
      ]);

      await logOperatorAction({
        userId: session.user.id,
        action: "UPDATE_STOCK",
        entityType: "PRODUCT",
        entityId: product.id,
        description: `Asistente IA ajustó stock de "${product.name}": ${quantity > 0 ? "+" : ""}${quantity} → ${newStock}`,
        link: `/products/${product.id}`,
      });

      return NextResponse.json<AssistantApiResponse>({
        message: `${msg}\n\n✅ Stock de **${product.name}** actualizado: ${quantity > 0 ? "+" : ""}${quantity} → **${newStock} unidades**`,
      });
    }

    // ── plan_whatsapp_campaign ────────────────────────────────────────────────
    if (toolBlock.name === "plan_whatsapp_campaign") {
      if (session.user.role !== "SUPERADMIN") {
        return NextResponse.json<AssistantApiResponse>({ message: "Solo los SUPERADMIN pueden enviar campañas de WhatsApp." });
      }

      const contactType = input.contact_type as string;
      const campaignMessage = (input.message as string || "").trim();
      const delaySeconds = Math.min(10, Math.max(2, Number(input.delay_seconds) || 3));
      const assistantMsg = input.assistant_message as string;

      const count = await prisma.contact.count({
        where: {
          type: contactType as "LEAD" | "CLIENT" | "INSTALLER",
          OR: [{ phone: { not: null } }, { whatsapp: { not: null } }],
        },
      });

      const cappedCount = Math.min(count, 200);

      if (count === 0) {
        return NextResponse.json<AssistantApiResponse>({ message: `No hay ${contactType === "LEAD" ? "leads" : contactType === "CLIENT" ? "clientes" : "instaladores"} con número de teléfono registrado.` });
      }

      const estimatedMinutes = Math.ceil((cappedCount * delaySeconds) / 60);

      const action: AssistantCampaignAction = {
        type: "campaign",
        label: `Enviar campaña a ${cappedCount} ${contactType === "LEAD" ? "leads" : contactType === "CLIENT" ? "clientes" : "instaladores"}`,
        contactType: contactType as "LEAD" | "CLIENT" | "INSTALLER",
        message: campaignMessage,
        delaySeconds,
        recipientCount: cappedCount,
      };

      return NextResponse.json<AssistantApiResponse>({
        message: `${assistantMsg}\n\n📊 **Resumen de la campaña:**\n- Destinatarios: **${cappedCount}** ${count > 200 ? `(máx. 200 de ${count} totales)` : ""}\n- Delay entre mensajes: **${delaySeconds} segundos**\n- Tiempo estimado: ~${estimatedMinutes} minuto${estimatedMinutes !== 1 ? "s" : ""}\n\nMensaje a enviar:\n> ${campaignMessage}\n\nConfirmá para iniciar el envío.`,
        action,
      });
    }

    // ── answer_only ───────────────────────────────────────────────────────────
    if (toolBlock.name === "answer_only") {
      return NextResponse.json<AssistantApiResponse>({ message: input.message as string });
    }

    return NextResponse.json<AssistantApiResponse>({ message: "No pude procesar tu solicitud." });

  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error({ err, detail }, "Error in assistant route");
    return NextResponse.json<AssistantApiResponse>({ message: "", error: detail }, { status: 500 });
  }
}
