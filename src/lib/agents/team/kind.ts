import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { monthSpendUsd } from "@/lib/agents/budget";
import { calendarDaysBetween, formatLocalDate, formatLocalDateTime } from "@/lib/agents/schedule";
import { defaultTeamConfig, readTeamConfig, teamConfigSchema } from "@/lib/agents/team/config";
import { auditedUsers, teamMetrics, userMetrics } from "@/lib/agents/team/metrics";
import { runTeam } from "@/lib/agents/team/run";
import { tickTeam } from "@/lib/agents/team/tick";
import { FIRMA } from "@/lib/agents/team/deliver";
import { NOT_HANDLED, type AgentKindImpl, type ToolContext } from "@/lib/agents/kinds/types";

/**
 * El Supervisor del equipo enchufado a la base común. Es un agente con dueños
 * (Carlos y Manuel): nadie más lo ve. Audita con herramientas de solo lectura y
 * todo lo que llega a un empleado —una tarea guiada, un mensaje— sale de una
 * tarjeta con botón que aprieta un dueño.
 */

const TOOLS: Anthropic.Tool[] = [
  {
    name: "ver_equipo",
    description: "Métricas de todo el equipo auditado en los últimos N días: tareas (cerradas, a tiempo, vencidas, horas para cerrar), leads (contactados, resultados, sin contactar), actividad en el CRM y respuesta a mails de clientes.",
    input_schema: {
      type: "object",
      properties: { dias: { type: "integer", description: "1-90. Por defecto 7." } },
    },
  },
  {
    name: "ver_persona",
    description: "Detalle de una persona: sus métricas, sus tareas abiertas con vencimiento y atraso, su actividad reciente en el CRM y los últimos avisos que le mandaste.",
    input_schema: {
      type: "object",
      properties: {
        usuario: { type: "string", description: "Nombre o parte del nombre" },
        dias: { type: "integer", description: "1-90. Por defecto 14." },
      },
      required: ["usuario"],
    },
  },
  {
    name: "ver_avisos",
    description: "Lo que hiciste hacia el equipo: recordatorios, mensajes, tareas guiadas, alertas y escalamientos a los dueños.",
    input_schema: {
      type: "object",
      properties: {
        usuario: { type: "string", description: "Nombre o parte del nombre (opcional)" },
        tipo: { type: "string", enum: ["REMINDER", "MESSAGE", "GUIDED_TASK", "ALERT", "ESCALATION", "WEEKLY_REPORT"] },
        cantidad: { type: "integer", description: "1-50. Por defecto 20." },
      },
    },
  },
  {
    name: "proponer_tarea_guiada",
    description: "Propone crearle a un empleado una tarea con instructivo paso a paso. Muestra un botón Crear tarea; no crea nada por sí mismo. Usala SOLO después de haber hecho las preguntas necesarias y tener todo claro.",
    input_schema: {
      type: "object",
      properties: {
        usuario: { type: "string" },
        titulo: { type: "string", description: "Corto y accionable" },
        objetivo: { type: "string", description: "Qué resultado se espera y para qué sirve" },
        pasos: { type: "array", items: { type: "string" }, description: "Paso a paso, en orden" },
        como_saber_que_esta_hecha: { type: "string" },
        recursos: { type: "string", description: "Contactos, archivos, secciones del CRM, a quién preguntar (opcional)" },
        fecha: { type: "string", description: "Vencimiento YYYY-MM-DD" },
        prioridad: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
      },
      required: ["usuario", "titulo", "objetivo", "pasos", "como_saber_que_esta_hecha", "fecha", "prioridad"],
    },
  },
  {
    name: "proponer_mensaje",
    description: "Propone mandarle a un empleado un mensaje puntual (campanita y mail), siempre amable. Muestra un botón Enviar; no manda nada por sí mismo.",
    input_schema: {
      type: "object",
      properties: {
        usuario: { type: "string" },
        asunto: { type: "string" },
        mensaje: { type: "string", description: `Texto completo, firmado "${FIRMA}"` },
      },
      required: ["usuario", "asunto", "mensaje"],
    },
  },
  {
    name: "proponer_cambio",
    description: "Propone un cambio de configuración (días para escalar, umbrales de alertas, resumen de la mañana, día del resumen semanal) y muestra un botón Aplicar.",
    input_schema: {
      type: "object",
      properties: {
        dias_para_escalar: { type: "integer" },
        alerta_dias_inactivo: { type: "integer" },
        alerta_tareas_vencidas: { type: "integer" },
        alerta_horas_mail: { type: "integer" },
        resumen_manana: { type: "boolean" },
        dia_resumen_semanal: { type: "integer", description: "1 = lunes … 7 = domingo" },
        explicacion: { type: "string" },
      },
      required: ["explicacion"],
    },
  },
];

function sinDatosDeContacto(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[teléfono]");
}

async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: ctx.agentId } });
  const config = readTeamConfig(agent.config);
  const equipo = await auditedUsers(agent, config);
  const buscar = (q: unknown) => {
    if (typeof q !== "string" || !q.trim()) return null;
    const t = q.trim().toLowerCase();
    return equipo.find((u) => u.name.toLowerCase().includes(t) || u.email.toLowerCase().startsWith(t)) ?? null;
  };
  const now = new Date();

  switch (name) {
    case "ver_equipo": {
      const dias = Math.min(90, Math.max(1, Number(input.dias) || 7));
      const metricas = await teamMetrics(agent, config, new Date(now.getTime() - dias * 86_400_000), now, now);
      return {
        periodo: `últimos ${dias} días`,
        gasto_mes_usd: Number((await monthSpendUsd(agent.id)).toFixed(4)),
        personas: metricas.map((m) => ({
          ...m,
          actividad: { ...m.actividad, ultima: m.actividad.ultima ? formatLocalDateTime(new Date(m.actividad.ultima)) : null },
        })),
      };
    }

    case "ver_persona": {
      const u = buscar(input.usuario);
      if (!u) return { error: `No encontré a "${String(input.usuario)}" entre las personas auditadas: ${equipo.map((x) => x.name).join(", ")}.` };
      const dias = Math.min(90, Math.max(1, Number(input.dias) || 14));
      const desde = new Date(now.getTime() - dias * 86_400_000);
      const [m, tareas, logs, avisos] = await Promise.all([
        userMetrics(u, desde, now, config, now),
        prisma.crmTask.findMany({ where: { userId: u.id, done: false }, orderBy: { dueDate: "asc" }, take: 40 }),
        prisma.operatorAuditLog.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 15 }),
        prisma.agentAction.findMany({ where: { agentId: agent.id, targetUserId: u.id }, orderBy: { createdAt: "desc" }, take: 10 }),
      ]);
      return {
        persona: u.name,
        rol: u.role,
        periodo: `últimos ${dias} días`,
        metricas: m,
        tareas_abiertas: tareas.map((t) => ({
          titulo: t.title,
          vence: t.dueDate ? formatLocalDate(t.dueDate) : "sin fecha",
          dias_de_atraso: t.dueDate ? Math.max(0, calendarDaysBetween(t.dueDate, now)) : 0,
          creada_por_agente: Boolean(t.agentId),
        })),
        actividad_reciente: logs.map((l) => ({
          cuando: formatLocalDateTime(l.createdAt),
          accion: l.action,
          detalle: sinDatosDeContacto(l.description).slice(0, 160),
        })),
        ultimos_avisos: avisos.map((a) => ({ cuando: formatLocalDateTime(a.createdAt), tipo: a.type, asunto: a.subject })),
      };
    }

    case "ver_avisos": {
      const u = buscar(input.usuario);
      const acciones = await prisma.agentAction.findMany({
        where: {
          agentId: agent.id,
          ...(u ? { targetUserId: u.id } : {}),
          ...(typeof input.tipo === "string" ? { type: input.tipo } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(50, Math.max(1, Number(input.cantidad) || 20)),
      });
      return acciones.map((a) => ({
        cuando: formatLocalDateTime(a.createdAt),
        tipo: a.type,
        para: a.contactName,
        asunto: a.subject,
        estado: a.status,
        simulado: a.simulated,
      }));
    }

    case "proponer_tarea_guiada": {
      const u = buscar(input.usuario);
      if (!u) return { error: `No encontré a "${String(input.usuario)}". Personas: ${equipo.map((x) => x.name).join(", ")}.` };
      const fecha = String(input.fecha ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "La fecha tiene que ser YYYY-MM-DD." };
      const pasos = Array.isArray(input.pasos) ? (input.pasos as unknown[]).map(String).filter(Boolean) : [];
      if (!pasos.length) return { error: "Faltan los pasos." };
      const notas = [
        `Objetivo: ${String(input.objetivo ?? "")}`,
        `Pasos:\n${pasos.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
        `Está hecha cuando: ${String(input.como_saber_que_esta_hecha ?? "")}`,
        input.recursos ? `Recursos: ${String(input.recursos)}` : null,
      ]
        .filter(Boolean)
        .join("\n\n");
      const prioridad = ["HIGH", "MEDIUM", "LOW"].includes(String(input.prioridad)) ? (String(input.prioridad) as "HIGH" | "MEDIUM" | "LOW") : "MEDIUM";
      ctx.cards.push({
        type: "guided_task",
        userId: u.id,
        userName: u.name,
        title: String(input.titulo ?? "").slice(0, 200),
        notes: notas.slice(0, 5000),
        dueDate: fecha,
        priority: prioridad,
      });
      return { ok: true, nota: "Se muestra la tarjeta con el botón Crear tarea; la crea uno de los dueños." };
    }

    case "proponer_mensaje": {
      const u = buscar(input.usuario);
      if (!u) return { error: `No encontré a "${String(input.usuario)}". Personas: ${equipo.map((x) => x.name).join(", ")}.` };
      ctx.cards.push({
        type: "user_message",
        userId: u.id,
        userName: u.name,
        subject: String(input.asunto ?? "").slice(0, 200),
        body: String(input.mensaje ?? "").slice(0, 4000),
      });
      return { ok: true, nota: "Se muestra la tarjeta con el botón Enviar; lo manda uno de los dueños." };
    }

    case "proponer_cambio": {
      const patch: Record<string, unknown> = {};
      const entero = (v: unknown) => (Number.isInteger(Number(v)) ? Number(v) : undefined);
      if (entero(input.dias_para_escalar) !== undefined) patch.escalateAfterDays = entero(input.dias_para_escalar);
      if (typeof input.resumen_manana === "boolean") patch.morningSummary = input.resumen_manana;
      if (entero(input.dia_resumen_semanal) !== undefined) patch.weeklyDay = entero(input.dia_resumen_semanal);
      const alertas = { ...config.alerts };
      let cambiaAlertas = false;
      if (entero(input.alerta_dias_inactivo) !== undefined) { alertas.inactiveDays = entero(input.alerta_dias_inactivo)!; cambiaAlertas = true; }
      if (entero(input.alerta_tareas_vencidas) !== undefined) { alertas.overdueTasks = entero(input.alerta_tareas_vencidas)!; cambiaAlertas = true; }
      if (entero(input.alerta_horas_mail) !== undefined) { alertas.unansweredMailHours = entero(input.alerta_horas_mail)!; cambiaAlertas = true; }
      if (cambiaAlertas) patch.alerts = alertas;
      if (!Object.keys(patch).length) return { error: "No entendí qué cambiar." };
      const prueba = teamConfigSchema.safeParse({ ...config, ...patch });
      if (!prueba.success) return { error: "Algún valor está fuera de rango." };
      ctx.cards.push({ type: "config_patch", description: String(input.explicacion ?? "Cambio de configuración"), patch });
      return { ok: true, nota: "Se muestra el botón Aplicar." };
    }

    default:
      return NOT_HANDLED;
  }
}

export const teamKind: AgentKindImpl = {
  configSchema: teamConfigSchema,
  defaultConfig: defaultTeamConfig,
  readConfig: readTeamConfig,
  hasApprovals: false,
  role: "el supervisor del equipo en el CRM de Kristall Film. Trabajás para Carlos y Manuel, los dueños, que son los únicos que te ven. Auditás cómo trabaja cada persona (tareas, leads, actividad en el CRM y respuesta a mails), les recordás amablemente sus tareas y los guiás con las tareas que Carlos y Manuel te encargan.",
  rules: [
    "Todo lo de la auditoría es confidencial entre vos, Carlos y Manuel. Lo que le llega a un empleado es siempre amable, nunca menciona que se lo audita ni lo compara con compañeros, y va firmado como \"Asistente de seguimiento\".",
    "Cuando Carlos o Manuel te encarguen una tarea para alguien, NO la propongas enseguida. Primero hacé preguntas, de a 2 a 4 por mensaje, hasta entenderla perfectamente: qué resultado esperan y para qué, quién la tiene que hacer, para cuándo, cómo la harían ellos paso a paso, qué recursos, contactos o archivos necesita, cómo se sabe que está bien hecha y qué prioridad tiene. Si algo queda ambiguo, volvé a preguntar. Recién con todo claro, proponela con proponer_tarea_guiada, con un instructivo que alguien nuevo pueda seguir sin preguntar.",
    "Cuando hables de una persona, apoyate en números de las herramientas y separá hechos de interpretaciones. Si los datos no alcanzan para concluir algo (por ejemplo, alguien que trabaja fuera del CRM), decilo.",
    "No ves teléfonos ni emails de clientes: en la actividad aparecen como [email] o [teléfono].",
  ],
  tools: TOOLS,
  runTool,
  async run({ agent, runId, now }) {
    const r = await runTeam({ agent, runId, now });
    return {
      status: "SUCCESS",
      stats: r.stats as unknown as Prisma.InputJsonValue,
      summary: r.summary,
      spend: r.spend,
      pendingCount: 0,
      notify: r.notify,
    };
  },
  async tick(agent, now) {
    await tickTeam(agent, now);
  },
};
