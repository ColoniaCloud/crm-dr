import type { Agent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { aiAvailable, complete, modelFor } from "@/lib/agents/llm";
import { hasBudget } from "@/lib/agents/budget";
import { NO_SPEND, type Spend } from "@/lib/agents/models";
import { startOfLocalDay } from "@/lib/agents/schedule";
import { zoneLabel } from "@/lib/agents/leads/geo";
import { readPrioritizerConfig, sectorLabel, type PrioritizerConfig } from "@/lib/agents/leads/prioritizer/config";
import { loadQueue, pickLeads, type Pick } from "@/lib/agents/leads/prioritizer/queue";
import { sendMorningMails } from "@/lib/agents/leads/prioritizer/mail";

const log = createLogger("agents/prioritizer");

/**
 * La ronda del Priorizador (AGENTES.md, "Agentes de leads"):
 *
 *   1. cierra las tareas abiertas cuyo lead ya se contactó por otro lado;
 *   2. calcula cuánto le falta a cada vendedor para su cupo (lo pendiente de
 *      días anteriores sigue en la lista: decisión L4);
 *   3. reparte la cola — y asigna los leads sin vendedor que le tocan;
 *   4. la IA escribe, por lead, por qué ese y qué decirle;
 *   5. crea las tareas y manda el mail de la mañana.
 *
 * No le escribe a ningún lead (decisión L1).
 */

export interface PrioritizerStats {
  vendedores: number;
  tareasNuevas: number;
  tareasArrastradas: number;
  asignados: number;
  cerradasSolas: number;
  mails: number;
  colaRestante: number;
  porVendedor: Array<{ nombre: string; nuevas: number; abiertas: number }>;
}

/** Texto para la IA: sin emails ni teléfonos, aunque estén escritos en las notas. */
function sinDatosDeContacto(texto: string | null, max = 300): string {
  if (!texto) return "";
  return texto
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[teléfono]")
    .slice(0, max);
}

interface Linea {
  motivo: string;
  decir: string;
}

function motivoBase(p: Pick): string {
  const partes = [sectorLabel(p.lead.sector), zoneLabel(p.lead.zone)];
  if (p.zoneMatch) partes.push("tu zona");
  if (p.lead.vehicleFlowWeekly) partes.push(`${p.lead.vehicleFlowWeekly} vehículos/semana`);
  if (p.lead.architecturalFlowMonthly) partes.push(`${p.lead.architecturalFlowMonthly} obras/mes`);
  return partes.join(" · ");
}

async function escribirLineas(agent: Agent, picks: Pick[], now: Date): Promise<{ lineas: Map<string, Linea>; spend: Spend }> {
  const lineas = new Map<string, Linea>();
  if (picks.length === 0 || !aiAvailable() || !(await hasBudget(agent.id, now))) return { lineas, spend: NO_SPEND };
  const fichas = picks.map((p, i) => ({
    i,
    empresa: p.lead.name,
    sector: sectorLabel(p.lead.sector),
    zona: zoneLabel(p.lead.zone),
    ciudad: p.lead.city ?? undefined,
    vehiculos_semana: p.lead.vehicleFlowWeekly ?? undefined,
    obras_mes: p.lead.architecturalFlowMonthly ?? undefined,
    proveedor_actual: sinDatosDeContacto(p.lead.currentSupplier, 120) || undefined,
    notas: sinDatosDeContacto(p.lead.notes) || undefined,
  }));
  try {
    const { text, spend } = await complete({
      model: modelFor(agent),
      maxTokens: 8000,
      system: `Sos "${agent.name}", el agente que prioriza leads en el CRM de Kristall Film (distribuidor de láminas de polarizado automotriz, arquitectónico y PPF). Para cada lead escribís dos líneas cortas para el vendedor que lo va a llamar: "motivo" (por qué vale la pena hoy, máximo 15 palabras) y "decir" (con qué abrir la conversación, máximo 25 palabras, concreto para su rubro). Español rioplatense. No inventes datos que no estén en la ficha.

Instrucciones del puesto:
${agent.instructions}

Respondé SOLO con un array JSON: [{"i":0,"motivo":"...","decir":"..."}, ...], uno por lead.`,
      prompt: JSON.stringify(fichas),
    });
    const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    const arr = JSON.parse(json) as Array<{ i: number; motivo?: string; decir?: string }>;
    for (const x of arr) {
      const p = picks[x.i];
      if (p && x.motivo && x.decir) lineas.set(p.lead.id, { motivo: x.motivo.slice(0, 200), decir: x.decir.slice(0, 300) });
    }
    return { lineas, spend };
  } catch (err) {
    log.warn({ err }, "No se pudieron escribir los motivos con IA; quedan los básicos");
    return { lineas, spend: NO_SPEND };
  }
}

export async function runPrioritizer(params: { agent: Agent; runId: string; now: Date }) {
  const { agent, now } = params;
  const config: PrioritizerConfig = readPrioritizerConfig(agent.config);

  // Solo vendedores activos que siguen existiendo como usuarios.
  const usuarios = await prisma.user.findMany({
    where: { id: { in: config.sellers.map((s) => s.userId) }, deletedAt: null },
    select: { id: true, name: true },
  });
  const nombre = new Map(usuarios.map((u) => [u.id, u.name]));
  const sellers = config.sellers.filter((s) => s.active && nombre.has(s.userId));

  // 1. Tareas abiertas cuyo lead ya no hace falta contactar.
  const abiertas = await prisma.crmTask.findMany({
    where: { agentId: agent.id, done: false },
    select: { id: true, userId: true, contactId: true },
  });
  const contactos = await prisma.contact.findMany({
    where: { id: { in: abiertas.map((t) => t.contactId).filter((x): x is string => Boolean(x)) } },
    select: { id: true, type: true, contacted: true },
  });
  const vigente = new Map(contactos.map((c) => [c.id, c.type === "LEAD" && !c.contacted]));
  const cerrar = abiertas.filter((t) => !t.contactId || !vigente.get(t.contactId)).map((t) => t.id);
  if (cerrar.length) await prisma.crmTask.updateMany({ where: { id: { in: cerrar } }, data: { done: true } });
  const siguen = abiertas.filter((t) => !cerrar.includes(t.id));

  // 2. Cuánto le falta a cada uno.
  const abiertasPor = new Map<string, number>();
  for (const t of siguen) if (t.userId) abiertasPor.set(t.userId, (abiertasPor.get(t.userId) ?? 0) + 1);
  const room = new Map(sellers.map((s) => [s.userId, Math.max(0, s.dailyQuota - (abiertasPor.get(s.userId) ?? 0))]));

  // 3. Repartir.
  const queue = await loadQueue(agent.id, config, now);
  const picks = pickLeads(queue, sellers, room, config);

  // 4. Motivo y qué decirle.
  const { lineas, spend } = await escribirLineas(agent, picks, now);

  // 5. Asignar y crear tareas.
  const vence = new Date(startOfLocalDay(now).getTime() + 15 * 3_600_000); // 12:00 de Buenos Aires
  const prioridad = (sector: string | null) => {
    const i = sector ? config.sectorOrder.indexOf(sector) : -1;
    return i === 0 ? "HIGH" : i === 1 ? "MEDIUM" : "LOW";
  };
  for (const p of picks) {
    if (p.assigns) {
      await prisma.contact.update({ where: { id: p.lead.id }, data: { assignedToId: p.sellerId } });
    }
    const l = lineas.get(p.lead.id);
    await prisma.crmTask.create({
      data: {
        title: `Contactar a ${p.lead.name}`,
        dueDate: vence,
        priority: prioridad(p.lead.sector),
        userId: p.sellerId,
        contactId: p.lead.id,
        agentId: agent.id,
        notes: l ? `Por qué: ${l.motivo}\nQué decirle: ${l.decir}\n(${motivoBase(p)})` : `Por qué: ${motivoBase(p)}`,
      },
    });
  }
  const asignados = picks.filter((p) => p.assigns).length;
  if (asignados > 0) {
    // La asignación la hizo el agente, pero la bitácora de operadores pide un
    // usuario: queda a nombre de quien creó el agente.
    await logOperatorAction({
      userId: agent.createdById,
      action: "AGENT_LEADS_ASSIGNED",
      entityType: "Agent",
      entityId: agent.id,
      description: `El agente "${agent.name}" asignó ${asignados} lead(s) sin vendedor según las zonas.`,
      link: `/agents/${agent.id}`,
    });
  }

  // Mail de la mañana.
  const mails = config.morningMail ? await sendMorningMails(agent, sellers.map((s) => s.userId)) : 0;

  const porVendedor = sellers.map((s) => ({
    nombre: nombre.get(s.userId)!,
    nuevas: picks.filter((p) => p.sellerId === s.userId).length,
    abiertas: (abiertasPor.get(s.userId) ?? 0) + picks.filter((p) => p.sellerId === s.userId).length,
  }));
  const stats: PrioritizerStats = {
    vendedores: sellers.length,
    tareasNuevas: picks.length,
    tareasArrastradas: siguen.length,
    asignados,
    cerradasSolas: cerrar.length,
    mails,
    colaRestante: queue.length - picks.length,
    porVendedor,
  };

  const summary =
    sellers.length === 0
      ? "No hay vendedores configurados: agregalos en Configuración para que arme las listas."
      : [
          `Armé las listas de hoy: ${picks.length} lead(s) nuevos${siguen.length ? ` y ${siguen.length} que seguían pendientes` : ""}.`,
          porVendedor.map((v) => `${v.nombre}: ${v.abiertas} en la lista (${v.nuevas} nuevos).`).join(" "),
          asignados ? `Asigné ${asignados} lead(s) que no tenían vendedor.` : null,
          cerrar.length ? `Cerré ${cerrar.length} tarea(s) de leads que ya se habían contactado.` : null,
          `Quedan ${queue.length - picks.length} lead(s) en la cola.`,
          config.morningMail ? (mails ? `Mandé ${mails} mail(s) de la mañana.` : "No salieron mails de la mañana (fuera de producción no se mandan).") : null,
        ]
          .filter(Boolean)
          .join(" ");

  return { stats, summary, spend };
}
