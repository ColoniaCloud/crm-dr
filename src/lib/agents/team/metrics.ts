import type { Agent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { agentOwners } from "@/lib/agents/access";
import { startOfLocalDay } from "@/lib/agents/schedule";
import type { TeamConfig } from "@/lib/agents/team/config";

/**
 * Las métricas del Supervisor del equipo, calculadas con código contra la base
 * (la IA solo las comenta). Cuatro frentes, uno por cada cosa que se audita:
 * tareas, leads, actividad en el CRM y respuesta a mails de clientes.
 *
 * WhatsApp no entra: el CRM guarda lo que se manda pero no lo que llega, así
 * que no hay forma de medir cuánto se tarda en responder.
 */

/** Cuentas de prueba (POS, demo): nunca se auditan. */
const CUENTA_DE_PRUEBA = /\.(local|test)$/i;

/** Remitentes automáticos: un mail de ellos no espera respuesta. */
const AUTOMATICO = /no-?reply|mailer-daemon|postmaster|notifications?@|notificaciones@|bounce/i;

export interface AuditedUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** A quiénes audita: todos los activos menos los dueños, los excluidos y las cuentas de prueba. */
export async function auditedUsers(agent: Agent, config: TeamConfig): Promise<AuditedUser[]> {
  const fuera = new Set([...(agentOwners(agent) ?? []), ...config.excludedUserIds]);
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  return users.filter((u) => !fuera.has(u.id) && !CUENTA_DE_PRUEBA.test(u.email));
}

export interface UserMetrics {
  userId: string;
  name: string;
  tareas: {
    abiertas: number;
    vencidas: number;
    venceHoy: number;
    completadas: number;
    completadasATiempo: number;
    horasPromedioCierre: number | null;
  };
  leads: {
    asignadosSinContactar: number;
    contactados: number;
    resultados: Record<string, number>;
    pasaronACliente: number;
  };
  actividad: {
    acciones: number;
    ultima: string | null;
    porTipo: Record<string, number>;
  };
  mail: {
    tieneCasilla: boolean;
    recibidos: number;
    respondidos: number;
    horasRespuestaMediana: number | null;
    sinResponder: number;
    noLeidos: number;
  };
}

const horas = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10;

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function userMetrics(
  user: { id: string; name: string },
  desde: Date,
  hasta: Date,
  config: TeamConfig,
  now: Date = new Date()
): Promise<UserMetrics> {
  const hoy = startOfLocalDay(now);
  const manana = new Date(hoy.getTime() + 86_400_000);

  const [abiertas, cerradas, leadsSinContactar, contactados, logs, casilla, recibidos] = await Promise.all([
    prisma.crmTask.findMany({ where: { userId: user.id, done: false }, select: { dueDate: true } }),
    prisma.crmTask.findMany({
      where: { userId: user.id, done: true, doneAt: { gte: desde, lte: hasta } },
      select: { createdAt: true, doneAt: true, dueDate: true },
    }),
    prisma.contact.count({ where: { type: "LEAD", assignedToId: user.id, contacted: false } }),
    prisma.contact.findMany({
      where: { assignedToId: user.id, contactDate: { gte: desde, lte: hasta } },
      select: { leadOutcome: true, type: true },
    }),
    prisma.operatorAuditLog.findMany({
      where: { userId: user.id, createdAt: { gte: desde, lte: hasta } },
      select: { action: true, createdAt: true },
    }),
    prisma.mailAccount.findUnique({ where: { userId: user.id }, select: { enabled: true } }),
    prisma.email.findMany({
      where: { userId: user.id, direction: "IN", receivedAt: { gte: desde, lte: hasta } },
      select: { messageId: true, receivedAt: true, fromAddress: true, read: true },
    }),
  ]);

  const deClientes = recibidos.filter((m) => !AUTOMATICO.test(m.fromAddress));
  const respuestas = deClientes.length
    ? await prisma.email.findMany({
        where: { userId: user.id, direction: "OUT", inReplyTo: { in: deClientes.map((m) => m.messageId) } },
        select: { inReplyTo: true, sentAt: true, createdAt: true },
      })
    : [];
  const primeraRespuesta = new Map<string, Date>();
  for (const r of respuestas) {
    const t = r.sentAt ?? r.createdAt;
    const prev = primeraRespuesta.get(r.inReplyTo!);
    if (!prev || t < prev) primeraRespuesta.set(r.inReplyTo!, t);
  }
  const tiempos: number[] = [];
  let sinResponder = 0;
  const limite = config.alerts.unansweredMailHours * 3_600_000;
  for (const m of deClientes) {
    const r = primeraRespuesta.get(m.messageId);
    if (r && m.receivedAt) tiempos.push(horas(r.getTime() - m.receivedAt.getTime()));
    else if (m.receivedAt && now.getTime() - m.receivedAt.getTime() > limite) sinResponder++;
  }

  // Ultima actividad: dentro del periodo, o la ultima de todas si no hubo.
  const ultima = logs.length
    ? new Date(Math.max(...logs.map((l) => l.createdAt.getTime())))
    : (await prisma.operatorAuditLog.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }))?.createdAt ?? null;
  const porTipo: Record<string, number> = {};
  for (const l of logs) porTipo[l.action] = (porTipo[l.action] ?? 0) + 1;

  const resultados: Record<string, number> = {};
  for (const c of contactados) if (c.leadOutcome) resultados[c.leadOutcome] = (resultados[c.leadOutcome] ?? 0) + 1;

  const conCierre = cerradas.filter((t) => t.doneAt);
  return {
    userId: user.id,
    name: user.name,
    tareas: {
      abiertas: abiertas.length,
      vencidas: abiertas.filter((t) => t.dueDate && t.dueDate < hoy).length,
      venceHoy: abiertas.filter((t) => t.dueDate && t.dueDate >= hoy && t.dueDate < manana).length,
      completadas: cerradas.length,
      // A tiempo = cerrada antes de que termine el día de su vencimiento.
      completadasATiempo: cerradas.filter(
        (t) => !t.dueDate || (t.doneAt && t.doneAt.getTime() < startOfLocalDay(t.dueDate).getTime() + 86_400_000)
      ).length,
      horasPromedioCierre: conCierre.length
        ? horas(conCierre.reduce((s, t) => s + (t.doneAt!.getTime() - t.createdAt.getTime()), 0) / conCierre.length)
        : null,
    },
    leads: {
      asignadosSinContactar: leadsSinContactar,
      contactados: contactados.length,
      resultados,
      pasaronACliente: contactados.filter((c) => c.type !== "LEAD").length,
    },
    actividad: {
      acciones: logs.length,
      ultima: ultima ? ultima.toISOString() : null,
      porTipo: Object.fromEntries(Object.entries(porTipo).sort((a, b) => b[1] - a[1]).slice(0, 8)),
    },
    mail: {
      tieneCasilla: Boolean(casilla?.enabled),
      recibidos: deClientes.length,
      respondidos: deClientes.filter((m) => primeraRespuesta.has(m.messageId)).length,
      horasRespuestaMediana: mediana(tiempos),
      sinResponder,
      noLeidos: deClientes.filter((m) => !m.read).length,
    },
  };
}

export async function teamMetrics(agent: Agent, config: TeamConfig, desde: Date, hasta: Date, now: Date = new Date()) {
  const users = await auditedUsers(agent, config);
  return Promise.all(users.map((u) => userMetrics(u, desde, hasta, config, now)));
}
