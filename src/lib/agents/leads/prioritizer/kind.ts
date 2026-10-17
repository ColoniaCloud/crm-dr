import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { monthSpendUsd } from "@/lib/agents/budget";
import { formatLocalDate, formatLocalDateTime } from "@/lib/agents/schedule";
import { ZONE_OPTIONS, zoneKey, zoneLabel } from "@/lib/agents/leads/geo";
import {
  defaultPrioritizerConfig,
  prioritizerConfigSchema,
  readPrioritizerConfig,
  sectorLabel,
  SECTOR_LABELS,
} from "@/lib/agents/leads/prioritizer/config";
import { loadQueue, scoreFor } from "@/lib/agents/leads/prioritizer/queue";
import { runPrioritizer } from "@/lib/agents/leads/prioritizer/run";
import { NOT_HANDLED, type AgentKindImpl, type ToolContext } from "@/lib/agents/kinds/types";

/**
 * El Priorizador de leads enchufado a la base común. Sus herramientas de chat
 * son de solo lectura, más una que propone cambios de configuración con un
 * botón. Ninguna devuelve teléfonos ni emails.
 */

const OUTCOME_LABEL: Record<string, string> = {
  INTERESTED: "le interesó",
  NOT_INTERESTED: "no le interesó",
  NO_ANSWER: "no contestó",
  CALL_BACK: "volver a llamar",
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: "ver_estado",
    description: "Estado del agente: activo o pausado, horario, gasto del mes, vendedores con su cupo y zonas, orden de sectores, zonas impulsadas y cuántos leads quedan en la cola por sector.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "ver_listas",
    description: "Las listas abiertas de cada vendedor: qué leads tiene para contactar, desde cuándo, sector, zona y el motivo.",
    input_schema: {
      type: "object",
      properties: { vendedor: { type: "string", description: "Parte del nombre del vendedor (opcional)" } },
    },
  },
  {
    name: "ver_resultados",
    description: "Cómo salieron los contactos en un período: cuántos se cerraron por resultado (le interesó, no le interesó, no contestó, volver a llamar), por vendedor y por sector.",
    input_schema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "YYYY-MM-DD. Por defecto, hace 7 días." },
        hasta: { type: "string", description: "YYYY-MM-DD. Por defecto, hoy." },
      },
    },
  },
  {
    name: "ver_cola",
    description: "Los próximos leads de la cola en orden de prioridad, con sector, zona y a quién está asignado. Se puede filtrar por sector o zona.",
    input_schema: {
      type: "object",
      properties: {
        sector: { type: "string", description: `Clave de sector: ${Object.keys(SECTOR_LABELS).join(", ")}` },
        zona: { type: "string", description: "Provincia o departamento, como lo diga el usuario" },
        cantidad: { type: "integer", description: "1-50. Por defecto 15." },
      },
    },
  },
  {
    name: "proponer_cambio",
    description: "Propone un cambio de configuración (orden de sectores, zonas impulsadas o cupo de un vendedor) y muestra un botón Aplicar. No cambia nada por sí mismo.",
    input_schema: {
      type: "object",
      properties: {
        orden_sectores: { type: "array", items: { type: "string" }, description: "Claves de sector en el orden nuevo" },
        zonas_impulsadas: { type: "array", items: { type: "string" }, description: "Provincias que suben para todos (reemplaza la lista)" },
        cupo: {
          type: "object",
          properties: { vendedor: { type: "string" }, cantidad: { type: "integer" } },
          description: "Nuevo cupo diario de un vendedor",
        },
        explicacion: { type: "string", description: "Qué cambia, en una frase, para mostrar en el botón" },
      },
      required: ["explicacion"],
    },
  },
];

function parseDay(raw: unknown, end: boolean): Date | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return new Date(`${raw}T${end ? "23:59:59" : "00:00:00"}-03:00`);
}

async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: ctx.agentId } });
  const config = readPrioritizerConfig(agent.config);
  const usuarios = await prisma.user.findMany({
    where: { id: { in: config.sellers.map((s) => s.userId) } },
    select: { id: true, name: true },
  });
  const nombre = new Map(usuarios.map((u) => [u.id, u.name]));
  const buscarVendedor = (q: unknown) => {
    if (typeof q !== "string" || !q.trim()) return null;
    const t = q.trim().toLowerCase();
    return config.sellers.find((s) => (nombre.get(s.userId) ?? "").toLowerCase().includes(t)) ?? null;
  };

  switch (name) {
    case "ver_estado": {
      const [gasto, cola] = await Promise.all([monthSpendUsd(agent.id), loadQueue(agent.id, config, new Date())]);
      const porSector: Record<string, number> = {};
      for (const l of cola) porSector[sectorLabel(l.sector)] = (porSector[sectorLabel(l.sector)] ?? 0) + 1;
      return {
        estado: agent.status,
        horario: agent.scheduleTime ? `${agent.scheduleTime} (días ${agent.scheduleDays})` : "sin horario, solo manual",
        proxima_ronda: agent.nextRunAt ? `${formatLocalDateTime(agent.nextRunAt)} (hora de Buenos Aires)` : null,
        gasto_mes_usd: Number(gasto.toFixed(4)),
        tope_mes_usd: Number(agent.monthlyBudgetUsd),
        vendedores: config.sellers.map((s) => ({
          nombre: nombre.get(s.userId) ?? "(usuario borrado)",
          activo: s.active,
          cupo: s.dailyQuota,
          zonas: s.zones.map(zoneLabel),
        })),
        orden_sectores: config.sectorOrder.map(sectorLabel),
        zonas_impulsadas: config.boostZones.map(zoneLabel),
        reparte_sin_vendedor: config.assignUnassigned,
        reintenta_no_contestados_a_los_dias: config.retryNoAnswerDays,
        cola_total: cola.length,
        cola_por_sector: porSector,
      };
    }

    case "ver_listas": {
      const vendedor = buscarVendedor(input.vendedor);
      const tareas = await prisma.crmTask.findMany({
        where: { agentId: agent.id, done: false, ...(vendedor ? { userId: vendedor.userId } : {}) },
        orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
        take: 200,
      });
      const contactos = await prisma.contact.findMany({
        where: { id: { in: tareas.map((t) => t.contactId).filter((x): x is string => Boolean(x)) } },
        select: { id: true, sector: true, state: true, city: true },
      });
      const c = new Map(contactos.map((x) => [x.id, x]));
      return tareas.map((t) => {
        const ct = t.contactId ? c.get(t.contactId) : undefined;
        return {
          vendedor: t.userId ? nombre.get(t.userId) ?? "?" : "?",
          lead: t.title.replace(/^Contactar a /, ""),
          sector: sectorLabel(ct?.sector ?? null),
          zona: zoneLabel(ct ? zoneKey(ct.state, ct.city) : null),
          en_lista_desde: t.createdAt ? formatLocalDate(t.createdAt) : null,
          motivo: t.notes?.split("\n")[0]?.replace(/^Por qué: /, "") ?? null,
        };
      });
    }

    case "ver_resultados": {
      const hasta = parseDay(input.hasta, true) ?? new Date();
      const desde = parseDay(input.desde, false) ?? new Date(hasta.getTime() - 7 * 86_400_000);
      const contactos = await prisma.contact.findMany({
        where: { leadOutcomeAt: { gte: desde, lte: hasta } },
        select: { leadOutcome: true, assignedToId: true, sector: true, type: true },
      });
      const otrosNombres = await prisma.user.findMany({
        where: { id: { in: [...new Set(contactos.map((c) => c.assignedToId).filter((x): x is string => Boolean(x)))] } },
        select: { id: true, name: true },
      });
      const n = new Map(otrosNombres.map((u) => [u.id, u.name]));
      const contar = (key: (c: (typeof contactos)[number]) => string) => {
        const out: Record<string, Record<string, number>> = {};
        for (const c of contactos) {
          const k = key(c);
          const r = OUTCOME_LABEL[c.leadOutcome ?? ""] ?? "otro";
          out[k] = out[k] ?? {};
          out[k][r] = (out[k][r] ?? 0) + 1;
        }
        return out;
      };
      const tareasCerradas = await prisma.crmTask.count({
        where: { agentId: agent.id, done: true, updatedAt: { gte: desde, lte: hasta } },
      });
      return {
        periodo: `${formatLocalDate(desde)} al ${formatLocalDate(hasta)}`,
        contactos_con_resultado: contactos.length,
        ya_son_clientes: contactos.filter((c) => c.type !== "LEAD").length,
        tareas_del_agente_cerradas: tareasCerradas,
        por_resultado: contar(() => "total").total ?? {},
        por_vendedor: contar((c) => (c.assignedToId ? n.get(c.assignedToId) ?? "?" : "sin vendedor")),
        por_sector: contar((c) => sectorLabel(c.sector)),
      };
    }

    case "ver_cola": {
      let cola = await loadQueue(agent.id, config, new Date());
      if (typeof input.sector === "string" && input.sector) cola = cola.filter((l) => l.sector === input.sector);
      if (typeof input.zona === "string" && input.zona) {
        const z = zoneKey(input.zona);
        cola = cola.filter((l) => l.zone === z);
      }
      const n = Math.min(50, Math.max(1, Number(input.cantidad) || 15));
      return cola
        .map((l) => ({ l, s: scoreFor(l, config.sellers.find((s) => s.userId === l.assignedToId) ?? null, config) }))
        .sort((a, b) => b.s - a.s || a.l.createdAt.getTime() - b.l.createdAt.getTime())
        .slice(0, n)
        .map(({ l }) => ({
          lead: l.name,
          sector: sectorLabel(l.sector),
          zona: zoneLabel(l.zone),
          asignado_a: l.assignedToId ? nombre.get(l.assignedToId) ?? "otro usuario" : "nadie",
        }));
    }

    case "proponer_cambio": {
      const patch: Record<string, unknown> = {};
      if (Array.isArray(input.orden_sectores)) {
        const validas = (input.orden_sectores as unknown[]).filter((x): x is string => typeof x === "string" && x in SECTOR_LABELS);
        if (validas.length) patch.sectorOrder = validas;
      }
      if (Array.isArray(input.zonas_impulsadas)) {
        const claves = (input.zonas_impulsadas as unknown[])
          .map((x) => (typeof x === "string" ? zoneKey(x) : null))
          .filter((x): x is string => Boolean(x) && ZONE_OPTIONS.some((z) => z.key === x));
        patch.boostZones = [...new Set(claves)];
      }
      if (input.cupo && typeof input.cupo === "object") {
        const c = input.cupo as { vendedor?: string; cantidad?: number };
        const v = buscarVendedor(c.vendedor);
        const cantidad = Number(c.cantidad);
        if (!v) return { error: "No encontré a ese vendedor entre los configurados." };
        if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100) return { error: "El cupo tiene que ser entre 1 y 100." };
        patch.sellers = config.sellers.map((s) => (s.userId === v.userId ? { ...s, dailyQuota: cantidad } : s));
      }
      if (Object.keys(patch).length === 0) return { error: "No entendí qué cambiar: sectores, zonas impulsadas o cupo." };
      ctx.cards.push({ type: "config_patch", description: String(input.explicacion ?? "Cambio de configuración"), patch });
      return { ok: true, nota: "Se muestra el botón Aplicar; hace falta que un SUPERADMIN lo apriete." };
    }

    default:
      return NOT_HANDLED;
  }
}

export const prioritizerKind: AgentKindImpl = {
  configSchema: prioritizerConfigSchema,
  defaultConfig: defaultPrioritizerConfig,
  readConfig: readPrioritizerConfig,
  hasApprovals: false,
  role: "el agente que prioriza leads en el CRM de Kristall Film (láminas de polarizado). Todos los días ordenás los leads sin contactar por sector y zona, repartís los que no tienen vendedor y le armás a cada vendedor su lista del día como tareas, con por qué y qué decirle. No le escribís a ningún lead: el contacto lo hace el vendedor.",
  rules: [
    "No tenés acceso a teléfonos ni emails de los leads: los ve el vendedor en su tarea y en su mail. Si te los piden, explicalo.",
    "Si te piden cambiar prioridades (sectores, zonas, cupos), proponelo con proponer_cambio para que un SUPERADMIN lo aplique.",
  ],
  tools: TOOLS,
  runTool,
  async run({ agent, runId, now }) {
    const r = await runPrioritizer({ agent, runId, now });
    return {
      status: "SUCCESS",
      stats: r.stats as unknown as Prisma.InputJsonValue,
      summary: r.summary,
      spend: r.spend,
      pendingCount: 0,
      notify: [],
    };
  },
};
