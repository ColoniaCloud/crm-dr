import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import type { AssistantApiResponse, AssistantNavigateAction } from "@/types/assistant";

const log = createLogger("api/assistant");
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `Eres un asistente de CRM para Dr. Polarizados, empresa de láminas de polarizado (automotriz, arquitectónico y PPF). Ayudás a los usuarios a navegar el sistema y a consultar datos en tiempo real.

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

FILTROS DISPONIBLES PARA LEADS (solo cuando navegás a /leads):
- filterContacted: true = ya contactados | false = no contactados
- filterCity: ciudad exacta (ej: "Buenos Aires", "Córdoba", "Rosario", "Mendoza")
- filterState: provincia (ej: "Buenos Aires", "Córdoba", "Santa Fe", "Mendoza")
- filterSector: "AUTO_TALLER" | "AUTO_CONCESIONARIO" | "AUTO_MAYORISTA" | "ARQUITECTURA_CONSTRUCTORA" | "ARQUITECTURA_VIDRIERIA" | "ARQUITECTURA_MAYORISTA"
- search: texto libre para nombre, empresa o teléfono

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
        message: {
          type: "string",
          description: "Mensaje breve y amigable confirmando adónde vas a llevar al usuario.",
        },
        leads_filters: {
          type: "object",
          description: "Filtros para pre-aplicar en /leads. Solo incluir cuando path sea /leads y el usuario haya especificado filtros.",
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
    description: "Consulta la base de datos para responder preguntas de negocio (ventas, leads, clientes, presupuestos). Usá este tool cuando el usuario pregunta por cifras o cantidades.",
    input_schema: {
      type: "object",
      properties: {
        query_type: {
          type: "string",
          enum: [
            "sales_this_month",
            "sales_last_month",
            "leads_total",
            "leads_not_contacted",
            "clients_total",
            "pending_quotes",
          ],
          description: "Qué dato consultar",
        },
      },
      required: ["query_type"],
    },
  },
  {
    name: "answer_only",
    description: "Responde con texto plano sin navegar ni consultar datos. Usá este tool para saludos, aclaraciones, o cuando la consulta no corresponde a ningún tool específico.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Respuesta al usuario" },
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
      const sales = await prisma.sale.findMany({
        where: { createdAt: { gte: startOfMonth } },
        select: { total: true },
      });
      const total = sales.reduce((s, x) => s + Number(x.total), 0);
      return `${sales.length} ventas este mes por un total de $${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS.`;
    }
    case "sales_last_month": {
      const sales = await prisma.sale.findMany({
        where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
        select: { total: true },
      });
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
    return NextResponse.json<AssistantApiResponse>({ message: "", error: "ANTHROPIC_API_KEY no configurada en variables de entorno" }, { status: 503 });
  }

  try {
    const { message, history = [] } = await req.json() as {
      message: string;
      history: { role: "user" | "assistant"; content: string }[];
    };

    const messages: Anthropic.MessageParam[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: message },
    ];

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");

    // No tool called → return plain text
    if (!toolBlock || toolBlock.type !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return NextResponse.json<AssistantApiResponse>({
        message: textBlock?.type === "text" ? textBlock.text : "¿Podés reformular tu consulta?",
      });
    }

    const input = toolBlock.input as Record<string, unknown>;

    // ── Tool: navigate_section ──────────────────────────────────────────
    if (toolBlock.name === "navigate_section") {
      const path = input.path as string;
      const msg = input.message as string;
      const leadsFilters = input.leads_filters as Record<string, unknown> | undefined;

      const action: AssistantNavigateAction = {
        type: "navigate",
        path,
        label: SECTION_LABELS[path] ?? "Ir allá",
      };

      if (path === "/leads" && leadsFilters && Object.keys(leadsFilters).length > 0) {
        action.sessionStorageKey = "leads-filters";
        action.sessionStorageValue = JSON.stringify(leadsFilters);
      }

      return NextResponse.json<AssistantApiResponse>({ message: msg, action });
    }

    // ── Tool: query_data ────────────────────────────────────────────────
    if (toolBlock.name === "query_data") {
      const dataResult = await executeDataQuery(input.query_type as string);

      const followUp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [
          ...messages,
          { role: "assistant" as const, content: response.content },
          {
            role: "user" as const,
            content: [{ type: "tool_result" as const, tool_use_id: toolBlock.id, content: dataResult }],
          },
        ],
      });

      const text = followUp.content.find((b) => b.type === "text");
      return NextResponse.json<AssistantApiResponse>({
        message: text?.type === "text" ? text.text : dataResult,
      });
    }

    // ── Tool: answer_only ───────────────────────────────────────────────
    if (toolBlock.name === "answer_only") {
      return NextResponse.json<AssistantApiResponse>({ message: input.message as string });
    }

    return NextResponse.json<AssistantApiResponse>({ message: "No pude procesar tu solicitud." });

  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error({ err, detail }, "Error in assistant route");
    // Return the real error so it's visible in the chat during development
    return NextResponse.json<AssistantApiResponse>(
      { message: "", error: detail },
      { status: 500 }
    );
  }
}
