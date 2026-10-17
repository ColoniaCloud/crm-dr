import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfLocalDay } from "@/lib/agents/schedule";
import { zoneKey, zoneLabel } from "@/lib/agents/leads/geo";
import { readPrioritizerConfig, sectorLabel } from "@/lib/agents/leads/prioritizer/config";
import { loadAgentFor, requireActor } from "@/lib/agents/api";

/**
 * Las listas del Priorizador: por vendedor, las tareas abiertas que armó el
 * agente y cuántas cerró hoy. Sin teléfonos ni emails: para eso está la ficha
 * del lead.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const found = await loadAgentFor(gate.value, id);
  if (!found.ok) return found.response;
  if (found.value.kind !== "LEAD_PRIORITIZER") return NextResponse.json({ sellers: [] });

  const config = readPrioritizerConfig(found.value.config);
  const hoy = startOfLocalDay(new Date());
  const [abiertas, cerradasHoy, usuarios] = await Promise.all([
    prisma.crmTask.findMany({ where: { agentId: id, done: false }, orderBy: { createdAt: "asc" } }),
    prisma.crmTask.groupBy({ by: ["userId"], where: { agentId: id, done: true, updatedAt: { gte: hoy } }, _count: true }),
    prisma.user.findMany({ where: { id: { in: config.sellers.map((s) => s.userId) } }, select: { id: true, name: true } }),
  ]);
  const contactos = await prisma.contact.findMany({
    where: { id: { in: abiertas.map((t) => t.contactId).filter((x): x is string => Boolean(x)) } },
    select: { id: true, sector: true, state: true, city: true },
  });
  const c = new Map(contactos.map((x) => [x.id, x]));
  const cerradas = new Map(cerradasHoy.map((x) => [x.userId, x._count]));
  const nombre = new Map(usuarios.map((u) => [u.id, u.name]));

  return NextResponse.json({
    sellers: config.sellers.map((s) => ({
      userId: s.userId,
      name: nombre.get(s.userId) ?? "(usuario borrado)",
      active: s.active,
      quota: s.dailyQuota,
      doneToday: cerradas.get(s.userId) ?? 0,
      tasks: abiertas
        .filter((t) => t.userId === s.userId)
        .map((t) => {
          const ct = t.contactId ? c.get(t.contactId) : undefined;
          return {
            id: t.id,
            contactId: t.contactId,
            title: t.title.replace(/^Contactar a /, ""),
            sector: sectorLabel(ct?.sector ?? null),
            zone: zoneLabel(ct ? zoneKey(ct.state, ct.city) : null),
            since: t.createdAt.toISOString(),
            carried: t.createdAt < hoy,
            notes: t.notes,
            priority: t.priority,
          };
        }),
    })),
  });
}
