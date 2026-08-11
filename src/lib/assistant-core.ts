import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { logOperatorAction } from "@/lib/notifications";
import { getRollByCode } from "@/lib/warranty";
import { buildActivityCSV, type ActivityCsvRow } from "@/lib/activity-csv";
import type {
  AssistantApiResponse,
  AssistantNavigateAction,
  AssistantTableAction,
  AssistantCampaignAction,
  AssistantFileAction,
} from "@/types/assistant";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-haiku-4-5-20251001";

export function isAdminOrAbove(role: string): boolean {
  return role === "ADMIN" || role === "SUPERADMIN";
}

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
- /warranty-claims → Centro de Garantías (reclamos y trazabilidad de rollos)

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
- Para agendar visitas o llamadas, necesitás el contacto y la fecha/hora (convertí fechas relativas como "mañana a las 10" a formato ISO 8601 usando la fecha actual).
- Para registrar un pago, necesitás la venta (por número o cliente), el monto y el método (CASH, TRANSFER, CHECK, CARD u OTHER).
- Para pedidos como "quién me debe", "saldos pendientes" o "clientes con deuda", usá list_pending_balances.
- Para pedidos como "cuánto cobramos", "cuánto entró" o "total de pagos" en un período, usá sum_payments. Convertí vos el período a fechas concretas (from/to en formato YYYY-MM-DD) usando la fecha actual: "el mes pasado" es del día 1 al último día del mes anterior, "esta semana" arranca el lunes, etc.
- Para gestionar reclamos de garantía, identificá el reclamo por el código de instalación o el nombre de quien reclamó.
- Para exportar actividad de operadores a CSV, convertí fechas relativas ("el mes pasado", "esta semana") a formato ISO 8601 (from/to). Si no se especifica operador, exportá la de todos.

RESTRICCIONES DE ROL (si el usuario no tiene el rol necesario, explicá amablemente que no tiene permisos):
- Solo ADMIN y SUPERADMIN pueden: crear/editar productos, ajustar stock, ver y registrar ventas, presupuestos y pagos, gestionar garantías (buscar rollos, listar y actualizar reclamos), y exportar actividad de operadores a CSV.
- Solo SUPERADMIN puede: lanzar campañas de WhatsApp.
- Cualquier rol autenticado (OPERATOR, ADMIN, SUPERADMIN) puede: crear/buscar contactos, convertir leads, importar CSV, y agendar visitas o llamadas.

Respondé siempre en español, de forma concisa y amigable. Si el usuario pide algo no disponible, explicalo brevemente.`;

function systemPromptWithDate(): string {
  const now = new Date();
  const todayLabel = now.toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  return `${SYSTEM_PROMPT}\n\nFECHA Y HORA ACTUAL: ${todayLabel} (${now.toISOString()}). Usá esta fecha real como referencia para resolver cualquier fecha relativa ("hoy", "mañana", "esta semana", "el mes pasado", etc.) — no asumas ninguna otra fecha.`;
}

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
            "/competitors", "/activities", "/whatsapp", "/warranty-claims",
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
    name: "search_warranty_roll",
    description: "Busca la trazabilidad de un código de rollo o instalación de garantía: producto, lote, vendedor, cliente e instalaciones activas. Solo ADMIN/SUPERADMIN.",
    input_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Código de rollo (fullRollCode) o de instalación (installationCode)." },
        message: { type: "string" },
      },
      required: ["code", "message"],
    },
  },
  {
    name: "list_warranty_claims",
    description: "Lista reclamos de garantía, opcionalmente filtrados por estado. Solo ADMIN/SUPERADMIN.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED", "ALL"], description: "Default ALL." },
        message: { type: "string" },
      },
      required: ["message"],
    },
  },
  {
    name: "update_warranty_claim",
    description: "Cambia el estado o agrega notas de resolución a un reclamo de garantía existente, identificado por el código de instalación o el nombre de quien reclamó. Solo ADMIN/SUPERADMIN.",
    input_schema: {
      type: "object",
      properties: {
        claim_search: { type: "string", description: "Código de instalación o nombre de quien reportó el reclamo." },
        status: { type: "string", enum: ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"] },
        resolution_notes: { type: "string" },
        message: { type: "string" },
      },
      required: ["claim_search", "message"],
    },
  },
  {
    name: "register_payment",
    description: "Registra un pago sobre una venta existente. Solo ADMIN/SUPERADMIN.",
    input_schema: {
      type: "object",
      properties: {
        sale_search: { type: "string", description: "Número de venta (ej: 123) o nombre/empresa del cliente." },
        amount: { type: "number" },
        method: { type: "string", enum: ["CASH", "TRANSFER", "CHECK", "CARD", "OTHER"] },
        reference: { type: "string" },
        notes: { type: "string" },
        message: { type: "string" },
      },
      required: ["sale_search", "amount", "method", "message"],
    },
  },
  {
    name: "schedule_visit",
    description: "Agenda una visita comercial a un contacto (lead, cliente o instalador), asignada a quien pide la acción.",
    input_schema: {
      type: "object",
      properties: {
        contact_search: { type: "string", description: "Nombre, empresa, email o teléfono del contacto." },
        scheduled_date: { type: "string", description: "Fecha y hora en formato ISO 8601 (ej: 2026-07-10T14:00:00)." },
        notes: { type: "string" },
        message: { type: "string" },
      },
      required: ["contact_search", "scheduled_date", "message"],
    },
  },
  {
    name: "schedule_call",
    description: "Agenda una llamada telefónica a un contacto (lead, cliente o instalador), asignada a quien pide la acción.",
    input_schema: {
      type: "object",
      properties: {
        contact_search: { type: "string", description: "Nombre, empresa, email o teléfono del contacto." },
        scheduled_date: { type: "string", description: "Fecha y hora en formato ISO 8601." },
        notes: { type: "string" },
        message: { type: "string" },
      },
      required: ["contact_search", "scheduled_date", "message"],
    },
  },
  {
    name: "search_sales",
    description: "Busca ventas por número o por nombre/empresa del cliente, mostrando total, pagado y estado. Solo ADMIN/SUPERADMIN.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Número de venta o nombre/empresa del cliente. Vacío para las últimas ventas." },
        message: { type: "string" },
      },
      required: ["message"],
    },
  },
  {
    name: "list_pending_balances",
    description: "Lista las ventas con saldo pendiente de cobro (total menos pagos registrados), ordenadas de mayor a menor saldo, mostrando empresa/cliente, saldo pendiente y un link a la venta. Solo ADMIN/SUPERADMIN.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
      required: ["message"],
    },
  },
  {
    name: "sum_payments",
    description: "Suma el total de pagos cobrados en un período de fechas. Usá esto cuando el usuario pregunte cuánto se cobró, cuánto entró o cuál fue el total de pagos en un rango (ej. \"cuánto es el total de los pagos del mes pasado\", \"cuánto cobramos en marzo\", \"cuánto entró esta semana\"). Es lo cobrado, distinto de lo vendido: para montos de ventas usá query_data. Solo ADMIN/SUPERADMIN.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Primer día del período, inclusive, en formato YYYY-MM-DD." },
        to: { type: "string", description: "Último día del período, inclusive, en formato YYYY-MM-DD." },
        period_label: { type: "string", description: "Cómo nombrar el período en la respuesta, tal como lo dijo el usuario. Ej: \"el mes pasado\", \"marzo\", \"esta semana\"." },
        message: { type: "string", description: "Mensaje breve de confirmación al usuario." },
      },
      required: ["from", "to", "period_label", "message"],
    },
  },
  {
    name: "search_quotes",
    description: "Busca presupuestos por número o por nombre/empresa del cliente, mostrando estado y total. Solo ADMIN/SUPERADMIN.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Número de presupuesto o nombre/empresa del cliente. Vacío para los últimos presupuestos." },
        message: { type: "string" },
      },
      required: ["message"],
    },
  },
  {
    name: "export_activity_csv",
    description: "Genera un archivo CSV con la actividad de operadores (actividad de contacto + auditoría) filtrado por operador y rango de fechas, y lo ofrece para descargar en el chat. Solo ADMIN/SUPERADMIN.",
    input_schema: {
      type: "object",
      properties: {
        operator_search: { type: "string", description: "Nombre o email del operador a filtrar. Vacío o \"todos\" para incluir a todos los operadores." },
        from: { type: "string", description: "Fecha de inicio en ISO 8601 (ej: 2026-07-01). Si no se especifica, se usa el inicio del mes actual." },
        to: { type: "string", description: "Fecha de fin en ISO 8601 (ej: 2026-07-31). Si no se especifica, se usa la fecha de hoy." },
        message: { type: "string", description: "Mensaje de confirmación al usuario." },
      },
      required: ["message"],
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
  "/warranty-claims": "Ir a Garantías",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CHECK: "Cheque",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

/**
 * Convierte un "YYYY-MM-DD" en el arranque o el cierre de ese día, en la zona
 * horaria del servidor.
 *
 * No se usa `new Date(str)` a propósito: esa forma interpreta la fecha como UTC,
 * así que en Argentina (UTC-3) el 1° de julio arranca el 30 de junio a las 21:00
 * y el rango se come un día ajeno. Es el mismo corrimiento que ya se corrigió en
 * los vencimientos de cuotas. Construir la fecha por componentes la deja en hora
 * local, igual que el resto de los rangos de executeDataQuery().
 *
 * Devuelve `null` si el texto no es una fecha real (incluye el caso "2026-02-31",
 * que JS aceptaría corriéndolo a marzo).
 */
function parseDayBoundary(value: string, edge: "start" | "end"): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value || "").trim());
  if (!match) return null;

  const [, y, m, d] = match.map(Number);
  const date = edge === "start"
    ? new Date(y, m - 1, d, 0, 0, 0, 0)
    : new Date(y, m - 1, d, 23, 59, 59, 999);

  const rolledOver = date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d;
  return rolledOver ? null : date;
}

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

export type AssistantActor = { userId: string; role: string };

export type AssistantResult = { data: AssistantApiResponse; status: number };

/**
 * Core of the AI assistant: takes a message + history, resolves it against the
 * Anthropic tool-use API, and executes whichever tool the model picked
 * against Prisma. Shared by the dashboard's session-authenticated route
 * (`src/app/api/assistant/route.ts`) and the mobile JWT-authenticated route
 * (`src/app/api/mobile/v1/assistant/route.ts`) — both just resolve their own
 * `actor` (userId + role) and an `internalFetchHeaders` set (forwarded only
 * to the CSV-import tool's internal fetch call) and delegate here so the ~20
 * tool implementations never have to be duplicated or kept in sync by hand.
 */
export async function runAssistant(params: {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  csvRows?: Record<string, string>[];
  csvContactType?: string;
  actor: AssistantActor;
  internalFetchHeaders: Record<string, string>;
}): Promise<AssistantResult> {
  const { message, history, csvRows, csvContactType, actor, internalFetchHeaders } = params;

  if (!process.env.ANTHROPIC_API_KEY) {
    return { data: { message: "", error: "ANTHROPIC_API_KEY no configurada" }, status: 503 };
  }

  try {
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
      system: systemPromptWithDate(),
      tools: TOOLS,
      messages,
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");

    if (!toolBlock || toolBlock.type !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return {
        data: { message: textBlock?.type === "text" ? textBlock.text : "¿Podés reformular tu consulta?" },
        status: 200,
      };
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

      return { data: { message: msg, action }, status: 200 };
    }

    // ── query_data ────────────────────────────────────────────────────────────
    if (toolBlock.name === "query_data") {
      const dataResult = await executeDataQuery(input.query_type as string);

      const followUp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: systemPromptWithDate(),
        messages: [
          ...messages,
          { role: "assistant" as const, content: response.content },
          { role: "user" as const, content: [{ type: "tool_result" as const, tool_use_id: toolBlock.id, content: dataResult }] },
        ],
      });

      const text = followUp.content.find((b) => b.type === "text");
      return { data: { message: text?.type === "text" ? text.text : dataResult }, status: 200 };
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
        return { data: { message: `${msg}\n\nNo encontré contactos con esos criterios.` }, status: 200 };
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

      return { data: { message: msg, action }, status: 200 };
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
        userId: actor.userId,
        action: "CREATE_CONTACT",
        entityType: contactType,
        entityId: contact.id,
        description: `Asistente IA creó contacto "${contact.firstName} ${contact.lastName}" como ${contactType}`,
      });

      return { data: { message: `${msg}\n\n✅ Contacto creado correctamente con ID: ${contact.id}` }, status: 200 };
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
        return { data: { message: `No encontré ningún lead con "${search}". Revisá el nombre o teléfono e intentá de nuevo.` }, status: 200 };
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
        userId: actor.userId,
        action: "INSTALLER_CREATED",
        entityType: "INSTALLER",
        entityId: installer.id,
        description: `Asistente IA copió lead "${lead.firstName} ${lead.lastName}" como instalador`,
        link: "/installers",
      });

      return {
        data: { message: `${msg}\n\n✅ Lead **${lead.firstName} ${lead.lastName}** copiado como instalador correctamente.` },
        status: 200,
      };
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
        return { data: { message: `No encontré ningún lead con "${search}". Revisá el nombre o teléfono.` }, status: 200 };
      }

      await prisma.contact.update({ where: { id: lead.id }, data: { type: "CLIENT" } });

      await logOperatorAction({
        userId: actor.userId,
        action: "LEAD_CONVERTED",
        entityType: "CLIENT",
        entityId: lead.id,
        description: `Asistente IA convirtió lead "${lead.firstName} ${lead.lastName}" a cliente`,
        link: `/clients`,
      });

      return {
        data: { message: `${msg}\n\n✅ **${lead.firstName} ${lead.lastName}** fue convertido a cliente correctamente.` },
        status: 200,
      };
    }

    // ── import_contacts_csv ───────────────────────────────────────────────────
    if (toolBlock.name === "import_contacts_csv") {
      const contactType = input.contact_type as string;
      const csvRowsRaw = (input.csv_rows as Record<string, string>[]) || [];
      const msg = input.message as string;

      if (csvRowsRaw.length === 0) {
        return { data: { message: "No recibí filas del CSV. Adjuntá el archivo CSV en el chat." }, status: 200 };
      }

      const hasNames = csvRowsRaw.every((r) => r.firstName || r.nombre || r.lastName || r.apellido || r.company || r.empresa);
      if (!hasNames) {
        const cols = Object.keys(csvRowsRaw[0] || {}).join(", ");
        return {
          data: {
            message: `El CSV no tiene las columnas requeridas. Encontré: **${cols}**.\n\nNecesito al menos: \`firstName\` (nombre) y \`lastName\` (apellido). También acepto: \`phone\`, \`email\`, \`whatsapp\`, \`company\`.`,
          },
          status: 200,
        };
      }

      const endpoint = contactType === "INSTALLER" ? "/api/installers/import-csv" : "/api/leads/import";
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

      const importRes = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...internalFetchHeaders,
        },
        body: JSON.stringify({ rows: csvRowsRaw }),
      });

      const importData = await importRes.json() as { imported?: number; error?: string };

      if (!importRes.ok || importData.error) {
        return { data: { message: `Error al importar: ${importData.error || "Error desconocido"}` }, status: 200 };
      }

      return {
        data: {
          message: `${msg}\n\n✅ Se importaron **${importData.imported}** contactos correctamente como ${contactType === "INSTALLER" ? "instaladores" : contactType === "CLIENT" ? "clientes" : "leads"}.`,
        },
        status: 200,
      };
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
        return { data: { message: `${msg}\n\nNo encontré productos con esos criterios.` }, status: 200 };
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

      return { data: { message: msg, action }, status: 200 };
    }

    // ── create_product ────────────────────────────────────────────────────────
    if (toolBlock.name === "create_product") {
      if (!isAdminOrAbove(actor.role)) {
        return { data: { message: "Solo ADMIN/SUPERADMIN pueden crear productos." }, status: 200 };
      }
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
        userId: actor.userId,
        action: "CREATE_PRODUCT",
        entityType: "PRODUCT",
        entityId: product.id,
        description: `Asistente IA creó producto "${product.name}"`,
        link: `/products/${product.id}`,
      });

      return {
        data: {
          message: `${msg}\n\n✅ Producto **${product.name}** creado con precio $${Number(product.price).toLocaleString("es-AR")} y stock inicial ${product.stock ?? 0}.`,
        },
        status: 200,
      };
    }

    // ── update_stock ──────────────────────────────────────────────────────────
    if (toolBlock.name === "update_stock") {
      if (!isAdminOrAbove(actor.role)) {
        return { data: { message: "Solo ADMIN/SUPERADMIN pueden ajustar stock." }, status: 200 };
      }
      const search = (input.product_search as string || "").trim();
      const quantity = Number(input.quantity);
      const reason = (input.reason as string || "Ajuste via Asistente IA").trim();
      const msg = input.message as string;

      if (isNaN(quantity) || quantity === 0) {
        return { data: { message: "La cantidad de ajuste debe ser un número distinto de cero." }, status: 200 };
      }

      const product = await prisma.product.findFirst({
        where: {
          active: true,
          OR: [{ name: { contains: search } }, { sku: { contains: search } }],
        },
      });

      if (!product) {
        return { data: { message: `No encontré ningún producto con "${search}".` }, status: 200 };
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
            userId: actor.userId,
          },
        }),
      ]);

      await logOperatorAction({
        userId: actor.userId,
        action: "UPDATE_STOCK",
        entityType: "PRODUCT",
        entityId: product.id,
        description: `Asistente IA ajustó stock de "${product.name}": ${quantity > 0 ? "+" : ""}${quantity} → ${newStock}`,
        link: `/products/${product.id}`,
      });

      return {
        data: {
          message: `${msg}\n\n✅ Stock de **${product.name}** actualizado: ${quantity > 0 ? "+" : ""}${quantity} → **${newStock} unidades**`,
        },
        status: 200,
      };
    }

    // ── plan_whatsapp_campaign ────────────────────────────────────────────────
    if (toolBlock.name === "plan_whatsapp_campaign") {
      if (actor.role !== "SUPERADMIN") {
        return { data: { message: "Solo los SUPERADMIN pueden enviar campañas de WhatsApp." }, status: 200 };
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
        return {
          data: { message: `No hay ${contactType === "LEAD" ? "leads" : contactType === "CLIENT" ? "clientes" : "instaladores"} con número de teléfono registrado.` },
          status: 200,
        };
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

      return {
        data: {
          message: `${assistantMsg}\n\n📊 **Resumen de la campaña:**\n- Destinatarios: **${cappedCount}** ${count > 200 ? `(máx. 200 de ${count} totales)` : ""}\n- Delay entre mensajes: **${delaySeconds} segundos**\n- Tiempo estimado: ~${estimatedMinutes} minuto${estimatedMinutes !== 1 ? "s" : ""}\n\nMensaje a enviar:\n> ${campaignMessage}\n\nConfirmá para iniciar el envío.`,
          action,
        },
        status: 200,
      };
    }

    // ── search_warranty_roll ──────────────────────────────────────────────────
    if (toolBlock.name === "search_warranty_roll") {
      if (!isAdminOrAbove(actor.role)) {
        return { data: { message: "Solo ADMIN/SUPERADMIN pueden consultar garantías." }, status: 200 };
      }
      const code = (input.code as string || "").trim();
      const msg = input.message as string;

      const roll = await getRollByCode(code);
      if (!roll) {
        return { data: { message: `${msg}\n\nNo encontré ningún rollo con el código "${code}".` }, status: 200 };
      }

      const clientName = roll.saleItem?.sale.contact
        ? roll.saleItem.sale.contact.company || `${roll.saleItem.sale.contact.firstName} ${roll.saleItem.sale.contact.lastName}`.trim()
        : "—";
      const sellerName = roll.saleItem?.sale.user?.name ?? "—";

      return {
        data: {
          message: `${msg}\n\n**${roll.fullRollCode}** (${roll.status})\n- Producto: ${roll.product.name}\n- Lote: ${roll.lot.lotNumber}\n- Vendedor: ${sellerName}\n- Cliente: ${clientName}\n- Instalaciones activas: ${roll._count.installations} / ${roll.installations.length}`,
        },
        status: 200,
      };
    }

    // ── list_warranty_claims ──────────────────────────────────────────────────
    if (toolBlock.name === "list_warranty_claims") {
      if (!isAdminOrAbove(actor.role)) {
        return { data: { message: "Solo ADMIN/SUPERADMIN pueden ver reclamos de garantía." }, status: 200 };
      }
      const status = input.status as string | undefined;
      const msg = input.message as string;

      const claims = await prisma.warrantyClaim.findMany({
        where: status && status !== "ALL" ? { status: status as "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED" } : {},
        take: 20,
        orderBy: { createdAt: "desc" },
        include: {
          installation: {
            select: { installationCode: true, roll: { select: { product: { select: { name: true } } } } },
          },
        },
      });

      if (claims.length === 0) {
        return { data: { message: `${msg}\n\nNo hay reclamos con esos criterios.` }, status: 200 };
      }

      const action: AssistantTableAction = {
        type: "table",
        title: `Reclamos de garantía (${claims.length})`,
        columns: ["Código", "Producto", "Reportado por", "Estado", "Fecha"],
        rows: claims.map((c) => ({
          "Código": c.installation.installationCode,
          Producto: c.installation.roll.product.name,
          "Reportado por": c.reporterName,
          Estado: c.status,
          Fecha: c.createdAt.toLocaleDateString("es-AR"),
        })),
      };

      return { data: { message: msg, action }, status: 200 };
    }

    // ── update_warranty_claim ─────────────────────────────────────────────────
    if (toolBlock.name === "update_warranty_claim") {
      if (!isAdminOrAbove(actor.role)) {
        return { data: { message: "Solo ADMIN/SUPERADMIN pueden gestionar reclamos de garantía." }, status: 200 };
      }
      const search = (input.claim_search as string || "").trim();
      const newStatus = input.status as "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED" | undefined;
      const notes = input.resolution_notes as string | undefined;
      const msg = input.message as string;

      const claim = await prisma.warrantyClaim.findFirst({
        where: {
          OR: [
            { installation: { installationCode: { contains: search } } },
            { reporterName: { contains: search } },
          ],
        },
        orderBy: { createdAt: "desc" },
        include: { installation: { select: { installationCode: true } } },
      });

      if (!claim) {
        return { data: { message: `No encontré ningún reclamo que coincida con "${search}".` }, status: 200 };
      }

      await prisma.warrantyClaim.update({
        where: { id: claim.id },
        data: {
          ...(newStatus ? { status: newStatus } : {}),
          ...(notes !== undefined ? { resolutionNotes: notes } : {}),
          ...(newStatus === "RESOLVED" || newStatus === "REJECTED" ? { resolvedAt: new Date() } : {}),
        },
      });

      await logOperatorAction({
        userId: actor.userId,
        action: "UPDATE_WARRANTY_CLAIM",
        entityType: "WARRANTY_CLAIM",
        entityId: claim.id,
        description: `Asistente IA actualizó reclamo "${claim.installation.installationCode}"${newStatus ? ` → ${newStatus}` : ""}`,
        link: "/warranty-claims",
      });

      return {
        data: { message: `${msg}\n\n✅ Reclamo de **${claim.installation.installationCode}** actualizado${newStatus ? ` a **${newStatus}**` : ""}.` },
        status: 200,
      };
    }

    // ── register_payment ──────────────────────────────────────────────────────
    if (toolBlock.name === "register_payment") {
      if (!isAdminOrAbove(actor.role)) {
        return { data: { message: "Solo ADMIN/SUPERADMIN pueden registrar pagos." }, status: 200 };
      }
      const search = (input.sale_search as string || "").trim();
      const amount = Number(input.amount);
      const method = input.method as string;
      const reference = (input.reference as string) || null;
      const notes = (input.notes as string) || null;
      const msg = input.message as string;

      if (isNaN(amount) || amount <= 0) {
        return { data: { message: "El monto del pago debe ser un número positivo." }, status: 200 };
      }

      const saleNumber = parseInt(search, 10);
      const sale = await prisma.sale.findFirst({
        where: !isNaN(saleNumber) && search !== ""
          ? { number: saleNumber }
          : {
              contact: {
                OR: [
                  { firstName: { contains: search } },
                  { lastName: { contains: search } },
                  { company: { contains: search } },
                ],
              },
            },
        orderBy: { createdAt: "desc" },
        include: { contact: { select: { id: true, firstName: true, lastName: true, company: true } } },
      });

      if (!sale) {
        return { data: { message: `No encontré ninguna venta que coincida con "${search}".` }, status: 200 };
      }

      const payment = await prisma.payment.create({
        data: {
          saleId: sale.id,
          contactId: sale.contactId,
          amount,
          method,
          reference,
          notes,
        },
      });

      const cName = sale.contact.company || `${sale.contact.firstName} ${sale.contact.lastName}`.trim();
      await logOperatorAction({
        userId: actor.userId,
        action: "CREATE_PAYMENT",
        entityType: "PAYMENT",
        entityId: payment.id,
        description: `Asistente IA registró pago $${amount} de "${cName}" (venta #${sale.number})`,
        link: `/sales/${sale.id}`,
      });

      return {
        data: { message: `${msg}\n\n✅ Pago de $${amount.toLocaleString("es-AR")} registrado sobre la venta #${sale.number} (${cName}).` },
        status: 200,
      };
    }

    // ── schedule_visit ────────────────────────────────────────────────────────
    if (toolBlock.name === "schedule_visit") {
      const search = (input.contact_search as string || "").trim();
      const scheduledDate = input.scheduled_date as string;
      const notes = (input.notes as string) || null;
      const msg = input.message as string;

      const contact = await prisma.contact.findFirst({
        where: {
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { company: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
          ],
        },
      });

      if (!contact) {
        return { data: { message: `No encontré ningún contacto que coincida con "${search}".` }, status: 200 };
      }

      const visit = await prisma.visit.create({
        data: {
          contactId: contact.id,
          assignedToId: actor.userId,
          createdById: actor.userId,
          scheduledDate: new Date(scheduledDate),
          notes,
        },
      });

      const cName = contact.company || `${contact.firstName} ${contact.lastName}`.trim();
      await logOperatorAction({
        userId: actor.userId,
        action: "CREATE_VISIT",
        entityType: "VISIT",
        entityId: visit.id,
        description: `Asistente IA agendó visita a "${cName}"`,
        link: "/calendar/visits",
      });

      return {
        data: { message: `${msg}\n\n✅ Visita agendada con **${cName}** para ${new Date(scheduledDate).toLocaleString("es-AR")}.` },
        status: 200,
      };
    }

    // ── schedule_call ─────────────────────────────────────────────────────────
    if (toolBlock.name === "schedule_call") {
      const search = (input.contact_search as string || "").trim();
      const scheduledDate = input.scheduled_date as string;
      const notes = (input.notes as string) || null;
      const msg = input.message as string;

      const contact = await prisma.contact.findFirst({
        where: {
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { company: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
          ],
        },
      });

      if (!contact) {
        return { data: { message: `No encontré ningún contacto que coincida con "${search}".` }, status: 200 };
      }

      const call = await prisma.call.create({
        data: {
          contactId: contact.id,
          assignedToId: actor.userId,
          createdById: actor.userId,
          scheduledAt: new Date(scheduledDate),
          notes,
        },
      });

      const cName = contact.company || `${contact.firstName} ${contact.lastName}`.trim();
      await logOperatorAction({
        userId: actor.userId,
        action: "CREATE_CALL",
        entityType: "CALL",
        entityId: call.id,
        description: `Asistente IA agendó llamada a "${cName}"`,
        link: "/calendar/calls",
      });

      return {
        data: { message: `${msg}\n\n✅ Llamada agendada con **${cName}** para ${new Date(scheduledDate).toLocaleString("es-AR")}.` },
        status: 200,
      };
    }

    // ── search_sales ──────────────────────────────────────────────────────────
    if (toolBlock.name === "search_sales") {
      if (!isAdminOrAbove(actor.role)) {
        return { data: { message: "Solo ADMIN/SUPERADMIN pueden consultar ventas." }, status: 200 };
      }
      const search = (input.search as string || "").trim();
      const msg = input.message as string;
      const saleNumber = parseInt(search, 10);

      const sales = await prisma.sale.findMany({
        where: search
          ? (!isNaN(saleNumber)
              ? { number: saleNumber }
              : { contact: { OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }, { company: { contains: search } }] } })
          : {},
        take: 15,
        orderBy: { createdAt: "desc" },
        include: {
          contact: { select: { firstName: true, lastName: true, company: true } },
          payments: { select: { amount: true } },
        },
      });

      if (sales.length === 0) {
        return { data: { message: `${msg}\n\nNo encontré ventas con esos criterios.` }, status: 200 };
      }

      const action: AssistantTableAction = {
        type: "table",
        title: `Ventas (${sales.length})`,
        columns: ["#", "Cliente", "Total", "Pagado", "Estado"],
        rows: sales.map((s) => {
          const paid = s.payments.reduce((sum, p) => sum + Number(p.amount), 0);
          const cName = s.contact.company || `${s.contact.firstName} ${s.contact.lastName}`.trim();
          return {
            "#": String(s.number),
            Cliente: cName,
            Total: `$${Number(s.total).toLocaleString("es-AR")}`,
            Pagado: `$${paid.toLocaleString("es-AR")}`,
            Estado: s.status,
          };
        }),
      };

      return { data: { message: msg, action }, status: 200 };
    }

    // ── list_pending_balances ─────────────────────────────────────────────────
    if (toolBlock.name === "list_pending_balances") {
      if (!isAdminOrAbove(actor.role)) {
        return { data: { message: "Solo ADMIN/SUPERADMIN pueden consultar saldos pendientes." }, status: 200 };
      }
      const msg = input.message as string;

      const sales = await prisma.sale.findMany({
        where: { status: { not: "CANCELLED" } },
        orderBy: { createdAt: "desc" },
        include: {
          contact: { select: { firstName: true, lastName: true, company: true } },
          payments: { select: { amount: true } },
        },
      });

      const pending = sales
        .map((s) => {
          const paid = s.payments.reduce((sum, p) => sum + Number(p.amount), 0);
          return { sale: s, balance: Number(s.total) - paid };
        })
        .filter((x) => x.balance > 0.01)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 30);

      if (pending.length === 0) {
        return { data: { message: `${msg}\n\nNo hay ventas con saldo pendiente.` }, status: 200 };
      }

      const action: AssistantTableAction = {
        type: "table",
        title: `Saldos pendientes (${pending.length})`,
        columns: ["#", "Empresa / Cliente", "Saldo pendiente"],
        rows: pending.map(({ sale: s, balance }) => ({
          "#": String(s.number),
          "Empresa / Cliente": s.contact.company || `${s.contact.firstName} ${s.contact.lastName}`.trim(),
          "Saldo pendiente": `$${balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
        })),
        rowLinks: pending.map(({ sale: s }) => `/sales/${s.id}`),
      };

      return { data: { message: msg, action }, status: 200 };
    }

    // ── sum_payments ──────────────────────────────────────────────────────────
    if (toolBlock.name === "sum_payments") {
      if (!isAdminOrAbove(actor.role)) {
        return { data: { message: "Solo ADMIN/SUPERADMIN pueden consultar pagos." }, status: 200 };
      }
      const msg = input.message as string;
      const periodLabel = (input.period_label as string) || "el período";

      const from = parseDayBoundary(input.from as string, "start");
      const to = parseDayBoundary(input.to as string, "end");

      if (!from || !to) {
        return { data: { message: `${msg}\n\nNo pude interpretar las fechas del período. Probá diciéndolo como "del 1 al 31 de julio" o "en junio".` }, status: 200 };
      }
      if (from > to) {
        return { data: { message: `${msg}\n\nEse período está al revés: la fecha de inicio es posterior a la de fin.` }, status: 200 };
      }

      // Se cuentan todos los pagos registrados en el rango: la pregunta es cuánta
      // plata entró, así que no se filtra por el estado de la venta asociada.
      const payments = await prisma.payment.findMany({
        where: { paidAt: { gte: from, lte: to } },
        orderBy: { paidAt: "desc" },
        include: {
          contact: { select: { firstName: true, lastName: true, company: true } },
          sale: { select: { number: true, status: true } },
        },
      });

      const money = (n: number) => `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
      // "el mes pasado" -> "del mes pasado"; "marzo" -> "de marzo".
      const deLabel = periodLabel.startsWith("el ") ? `del ${periodLabel.slice(3)}` : `de ${periodLabel}`;

      // Quién quedó sin cobrar en el período. El saldo se calcula con el mismo
      // criterio que list_pending_balances (total menos pagos, sin contar
      // anuladas) pero agrupado por cliente, no por venta: al usuario le importa
      // a quién reclamarle, y un cliente puede tener varias ventas abiertas.
      const cobraronEnElPeriodo = new Set(payments.map((p) => p.contactId));
      const ventasVigentes = await prisma.sale.findMany({
        where: { status: { not: "CANCELLED" } },
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, company: true } },
          payments: { select: { amount: true } },
        },
      });

      const saldoPorCliente = new Map<string, { nombre: string; saldo: number }>();
      for (const s of ventasVigentes) {
        const pagado = s.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const saldo = Number(s.total) - pagado;
        if (saldo <= 0.01) continue;
        const acumulado = saldoPorCliente.get(s.contact.id);
        saldoPorCliente.set(s.contact.id, {
          nombre: s.contact.company || `${s.contact.firstName} ${s.contact.lastName}`.trim(),
          saldo: (acumulado?.saldo ?? 0) + saldo,
        });
      }

      const sinPagar = [...saldoPorCliente.entries()]
        .filter(([contactId]) => !cobraronEnElPeriodo.has(contactId))
        .map(([, cliente]) => cliente)
        .sort((a, b) => b.saldo - a.saldo);

      const avisoSinPagar = sinPagar.length === 0
        ? ""
        : `\n\n⚠️ **${sinPagar.length === 1 ? "1 cliente con saldo pendiente no registró" : `${sinPagar.length} clientes con saldo pendiente no registraron`} ningún pago en ${periodLabel}:**\n` +
          sinPagar.slice(0, 10).map((c) => `- ${c.nombre} — debe ${money(c.saldo)}`).join("\n") +
          (sinPagar.length > 10 ? `\n- …y ${sinPagar.length - 10} más. Pedime "quiénes me deben" para verlos a todos.` : "");

      if (payments.length === 0) {
        return { data: { message: `${msg}\n\nNo hay pagos registrados en ${periodLabel}.${avisoSinPagar}` }, status: 200 };
      }

      const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);

      // Los pagos sobre ventas anuladas NO se descuentan del total: esa plata
      // entró igual. Se muestran aparte para que el número no se lea como
      // facturación válida, y la venta queda marcada en la tabla.
      const anulados = payments.filter((p) => p.sale.status === "CANCELLED");
      const totalAnulado = anulados.reduce((sum, p) => sum + Number(p.amount), 0);

      const avisoAnuladas = anulados.length === 0
        ? ""
        : `\n\n⚠️ Incluye ${money(totalAnulado)} en ${anulados.length} ${anulados.length === 1 ? "pago" : "pagos"} sobre ventas anuladas ` +
          `(${[...new Set(anulados.map((p) => `#${p.sale.number}`))].join(", ")}). ` +
          `**Neto sin anuladas: ${money(total - totalAnulado)}.**`;

      const shown = payments.slice(0, 30);
      const overflow = payments.length - shown.length;

      const summary =
        `${msg}\n\n**Total cobrado en ${periodLabel}: ${money(total)}** ` +
        `(${payments.length} ${payments.length === 1 ? "pago" : "pagos"}).` +
        avisoAnuladas +
        (overflow > 0 ? `\n\nEl total incluye todos los pagos; la tabla lista los ${shown.length} más recientes.` : "") +
        avisoSinPagar;

      const action: AssistantTableAction = {
        type: "table",
        title: `Pagos ${deLabel} (${payments.length})`,
        columns: ["Fecha", "Venta", "Empresa / Cliente", "Método", "Monto"],
        rows: shown.map((p) => ({
          Fecha: p.paidAt.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }),
          Venta: p.sale.status === "CANCELLED" ? `#${p.sale.number} (anulada)` : `#${p.sale.number}`,
          "Empresa / Cliente": p.contact.company || `${p.contact.firstName} ${p.contact.lastName}`.trim(),
          Método: PAYMENT_METHOD_LABELS[p.method ?? ""] ?? p.method ?? "-",
          Monto: money(Number(p.amount)),
        })),
        rowLinks: shown.map((p) => `/sales/${p.saleId}`),
      };

      return { data: { message: summary, action }, status: 200 };
    }

    // ── search_quotes ─────────────────────────────────────────────────────────
    if (toolBlock.name === "search_quotes") {
      if (!isAdminOrAbove(actor.role)) {
        return { data: { message: "Solo ADMIN/SUPERADMIN pueden consultar presupuestos." }, status: 200 };
      }
      const search = (input.search as string || "").trim();
      const msg = input.message as string;
      const quoteNumber = parseInt(search, 10);

      const quotes = await prisma.quote.findMany({
        where: search
          ? (!isNaN(quoteNumber)
              ? { number: quoteNumber }
              : { contact: { OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }, { company: { contains: search } }] } })
          : {},
        take: 15,
        orderBy: { createdAt: "desc" },
        include: { contact: { select: { firstName: true, lastName: true, company: true } } },
      });

      if (quotes.length === 0) {
        return { data: { message: `${msg}\n\nNo encontré presupuestos con esos criterios.` }, status: 200 };
      }

      const action: AssistantTableAction = {
        type: "table",
        title: `Presupuestos (${quotes.length})`,
        columns: ["#", "Cliente", "Total", "Estado"],
        rows: quotes.map((q) => ({
          "#": String(q.number),
          Cliente: q.contact.company || `${q.contact.firstName} ${q.contact.lastName}`.trim(),
          Total: `$${Number(q.total).toLocaleString("es-AR")}`,
          Estado: q.status,
        })),
      };

      return { data: { message: msg, action }, status: 200 };
    }

    // ── export_activity_csv ───────────────────────────────────────────────────
    if (toolBlock.name === "export_activity_csv") {
      if (!isAdminOrAbove(actor.role)) {
        return { data: { message: "Solo ADMIN/SUPERADMIN pueden exportar actividad de operadores." }, status: 200 };
      }

      const msg = input.message as string;
      const operatorSearch = (input.operator_search as string || "").trim();
      const now = new Date();
      const fromDate = input.from ? new Date(input.from as string) : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const toDate = input.to ? new Date(`${input.to as string}T23:59:59.999`) : now;

      let operator: { id: string; name: string } | null = null;
      if (operatorSearch && operatorSearch.toLowerCase() !== "todos") {
        operator = await prisma.user.findFirst({
          where: { OR: [{ name: { contains: operatorSearch } }, { email: { contains: operatorSearch } }] },
          select: { id: true, name: true },
        });
        if (!operator) {
          return { data: { message: `${msg}\n\nNo encontré ningún operador que coincida con "${operatorSearch}".` }, status: 200 };
        }
      }

      type AssistantActivityRow = {
        createdAt: string;
        responded: string | null;
        interestLevel: string;
        contactMethod: string;
        notes: string | null;
        userName: string;
        firstName: string;
        lastName: string;
        company: string | null;
      };
      type AssistantAuditRow = { action: string; description: string; createdAt: string };

      const [activityRows, auditRows] = await Promise.all([
        operator
          ? prisma.$queryRaw<AssistantActivityRow[]>`
              SELECT a.createdAt, a.responded, a.interestLevel, a.contactMethod, a.notes,
                     u.name AS userName, c.firstName, c.lastName, c.company
              FROM activity_logs a
              INNER JOIN users u ON a.userId = u.id
              INNER JOIN contacts c ON a.contactId = c.id
              WHERE a.userId = ${operator.id} AND a.createdAt >= ${fromDate} AND a.createdAt <= ${toDate}
              ORDER BY a.createdAt DESC
              LIMIT 300
            `
          : prisma.$queryRaw<AssistantActivityRow[]>`
              SELECT a.createdAt, a.responded, a.interestLevel, a.contactMethod, a.notes,
                     u.name AS userName, c.firstName, c.lastName, c.company
              FROM activity_logs a
              INNER JOIN users u ON a.userId = u.id
              INNER JOIN contacts c ON a.contactId = c.id
              WHERE a.createdAt >= ${fromDate} AND a.createdAt <= ${toDate}
              ORDER BY a.createdAt DESC
              LIMIT 300
            `,
        operator
          ? prisma.$queryRaw<AssistantAuditRow[]>`
              SELECT action, description, createdAt FROM operator_audit_logs
              WHERE userId = ${operator.id} AND createdAt >= ${fromDate} AND createdAt <= ${toDate}
                AND action != 'CONTACT_ACTIVITY'
              ORDER BY createdAt DESC
              LIMIT 300
            `
          : prisma.$queryRaw<AssistantAuditRow[]>`
              SELECT action, description, createdAt FROM operator_audit_logs
              WHERE createdAt >= ${fromDate} AND createdAt <= ${toDate}
                AND action != 'CONTACT_ACTIVITY'
              ORDER BY createdAt DESC
              LIMIT 300
            `,
      ]);

      const csvRowsOut: ActivityCsvRow[] = [
        ...activityRows.map((r) => ({
          kind: "activity" as const,
          createdAt: r.createdAt,
          userName: r.userName,
          contactName: r.company || `${r.firstName} ${r.lastName}`.trim(),
          interestLevel: r.interestLevel,
          contactMethod: r.contactMethod,
          responded: r.responded,
          notes: r.notes,
        })),
        ...auditRows.map((r) => ({
          kind: "audit" as const,
          createdAt: r.createdAt,
          action: r.action,
          description: r.description,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (csvRowsOut.length === 0) {
        return { data: { message: `${msg}\n\nNo hay actividad para exportar en ese rango.` }, status: 200 };
      }

      const operatorName = operator?.name ?? "Todos";
      const csv = buildActivityCSV(csvRowsOut, operatorName);
      const slug = operatorName.toLowerCase().replace(/\s+/g, "_");
      const filename = `actividad_operadores_${slug}_${fromDate.toISOString().slice(0, 10)}_a_${toDate.toISOString().slice(0, 10)}.csv`;

      const action: AssistantFileAction = {
        type: "file",
        filename,
        mimeType: "text/csv;charset=utf-8;",
        contentBase64: Buffer.from(csv, "utf-8").toString("base64"),
        label: `Descargar ${filename}`,
      };

      return { data: { message: msg, action }, status: 200 };
    }

    // ── answer_only ───────────────────────────────────────────────────────────
    if (toolBlock.name === "answer_only") {
      return { data: { message: input.message as string }, status: 200 };
    }

    return { data: { message: "No pude procesar tu solicitud." }, status: 200 };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw Object.assign(new Error(detail), { cause: err });
  }
}
