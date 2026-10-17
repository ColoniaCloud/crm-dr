import { prisma } from "@/lib/prisma";
import { zoneKey } from "@/lib/agents/leads/geo";
import type { PrioritizerConfig, SellerConfig } from "@/lib/agents/leads/prioritizer/config";

/**
 * La cola del Priorizador: qué leads se pueden poner en una lista y en qué
 * orden. Todo con código, sin IA (decisión 2 de AGENTES.md, aplicada a leads).
 *
 * Entra a la cola un lead que:
 *   - es LEAD y nunca se contactó (`contacted = false`);
 *   - tiene por dónde contactarlo (teléfono, WhatsApp o email);
 *   - no "no contestó" hace menos de `retryNoAnswerDays`, ni tiene un "volver a
 *     llamar" para más adelante;
 *   - no está ya en una tarea abierta de este agente.
 *
 * Los contactados quedan fuera: los retoma el agente de Seguimiento.
 */

export interface QueueLead {
  id: string;
  name: string;
  sector: string | null;
  zone: string | null;
  city: string | null;
  assignedToId: string | null;
  createdAt: Date;
  vehicleFlowWeekly: number | null;
  architecturalFlowMonthly: number | null;
  notes: string | null;
  currentSupplier: string | null;
}

export async function loadQueue(agentId: string, config: PrioritizerConfig, now: Date): Promise<QueueLead[]> {
  const abiertas = await prisma.crmTask.findMany({
    where: { agentId, done: false, contactId: { not: null } },
    select: { contactId: true },
  });
  const enLista = new Set(abiertas.map((t) => t.contactId!));
  const reintento = new Date(now.getTime() - config.retryNoAnswerDays * 86_400_000);

  const leads = await prisma.contact.findMany({
    where: {
      type: "LEAD",
      contacted: false,
      OR: [{ phone: { not: null } }, { whatsapp: { not: null } }, { email: { not: null } }],
      AND: [
        { OR: [{ leadOutcome: null }, { leadOutcome: { not: "NO_ANSWER" } }, { leadOutcomeAt: { lt: reintento } }] },
        { OR: [{ nextFollowUpAt: null }, { nextFollowUpAt: { lte: now } }] },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      company: true,
      sector: true,
      state: true,
      city: true,
      assignedToId: true,
      createdAt: true,
      vehicleFlowWeekly: true,
      architecturalFlowMonthly: true,
      notes: true,
      currentSupplier: true,
      phone: true,
      whatsapp: true,
      email: true,
    },
  });

  return leads
    // El filtro de "tiene por dónde contactarlo" deja pasar strings vacíos.
    .filter((l) => [l.phone, l.whatsapp, l.email].some((x) => x?.trim()))
    .filter((l) => !enLista.has(l.id))
    .map((l) => ({
      id: l.id,
      name: l.company?.trim() || `${l.firstName} ${l.lastName}`.trim() || "Sin nombre",
      sector: l.sector,
      zone: zoneKey(l.state, l.city),
      city: l.city,
      assignedToId: l.assignedToId,
      createdAt: l.createdAt,
      vehicleFlowWeekly: l.vehicleFlowWeekly,
      architecturalFlowMonthly: l.architecturalFlowMonthly,
      notes: l.notes,
      currentSupplier: l.currentSupplier,
    }));
}

/**
 * Puntaje de un lead para un vendedor. El sector manda (decisión L2): cada
 * escalón de sector vale más que todo lo demás junto, así que una zona propia
 * nunca hace pasar un sector peor por delante de uno mejor.
 */
export function scoreFor(lead: QueueLead, seller: SellerConfig | null, config: PrioritizerConfig): number {
  const idx = lead.sector ? config.sectorOrder.indexOf(lead.sector) : -1;
  const sector = idx >= 0 ? (config.sectorOrder.length - idx) * 1000 : 0;
  const zonaPropia = seller && lead.zone && seller.zones.includes(lead.zone) ? 300 : 0;
  const yaEsSuyo = seller && lead.assignedToId === seller.userId ? 200 : 0;
  const impulsada = lead.zone && config.boostZones.includes(lead.zone) ? 150 : 0;
  const volumen = lead.vehicleFlowWeekly || lead.architecturalFlowMonthly ? 50 : 0;
  return sector + zonaPropia + yaEsSuyo + impulsada + volumen;
}

/** ¿Este lead le puede tocar a este vendedor? */
function eligible(lead: QueueLead, seller: SellerConfig, config: PrioritizerConfig, zonasConDueño: Set<string>): boolean {
  if (lead.assignedToId) return lead.assignedToId === seller.userId;
  if (!config.assignUnassigned) return false;
  // Sin vendedor: le toca a quien tenga la zona; si la zona no es de nadie, a cualquiera.
  if (lead.zone && zonasConDueño.has(lead.zone)) return seller.zones.includes(lead.zone);
  return true;
}

export interface Pick {
  sellerId: string;
  lead: QueueLead;
  /** El lead no tenía vendedor y se le asigna en esta ronda. */
  assigns: boolean;
  zoneMatch: boolean;
}

/**
 * Reparte la cola entre los vendedores, de a uno por vuelta, para que los
 * leads sin dueño se repartan parejo y ningún vendedor se lleve todos los
 * mejores. `room` es cuánto le falta a cada uno para llegar a su cupo.
 */
export function pickLeads(
  queue: QueueLead[],
  sellers: SellerConfig[],
  room: Map<string, number>,
  config: PrioritizerConfig
): Pick[] {
  const zonasConDueño = new Set(sellers.flatMap((s) => s.zones));
  const listas = new Map(
    sellers.map((s) => [
      s.userId,
      queue
        .filter((l) => eligible(l, s, config, zonasConDueño))
        .map((l) => ({ l, score: scoreFor(l, s, config) }))
        .sort((a, b) => b.score - a.score || a.l.createdAt.getTime() - b.l.createdAt.getTime())
        .map((x) => x.l),
    ])
  );
  const tomados = new Set<string>();
  const cursor = new Map(sellers.map((s) => [s.userId, 0]));
  const faltan = new Map(room);
  const picks: Pick[] = [];

  let huboAlgo = true;
  while (huboAlgo) {
    huboAlgo = false;
    for (const s of sellers) {
      if ((faltan.get(s.userId) ?? 0) <= 0) continue;
      const lista = listas.get(s.userId)!;
      let i = cursor.get(s.userId)!;
      while (i < lista.length && tomados.has(lista[i].id)) i++;
      cursor.set(s.userId, i + 1);
      if (i >= lista.length) continue;
      const lead = lista[i];
      tomados.add(lead.id);
      faltan.set(s.userId, (faltan.get(s.userId) ?? 0) - 1);
      picks.push({
        sellerId: s.userId,
        lead,
        assigns: !lead.assignedToId,
        zoneMatch: Boolean(lead.zone && s.zones.includes(lead.zone)),
      });
      huboAlgo = true;
    }
  }
  return picks;
}
