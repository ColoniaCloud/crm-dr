import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { isAdminRole } from "@/lib/crm-tasks";
import type { AgendaItem } from "@/types/assistant-panel";

const log = createLogger("api/assistant/agenda");

const AR_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Argentina/Buenos_Aires",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Una fecha guardada a las 00:00 de Argentina es un "día", no una hora. */
function isMidnightAR(d: Date): boolean {
  return AR_TIME.format(d) === "00:00";
}

function contactName(c: { firstName: string; lastName: string; company: string | null } | null | undefined): string {
  if (!c) return "—";
  return c.company || `${c.firstName} ${c.lastName}`.trim() || "—";
}

const contactSelect = { id: true, firstName: true, lastName: true, company: true } as const;

/**
 * GET /api/assistant/agenda?from=ISO&to=ISO[&scope=team]
 *
 * Todo lo agendable de una semana para el calendario del asistente: llamadas,
 * visitas, tareas con fecha, vencimientos de presupuestos, y —solo ADMIN+—
 * llegadas esperadas de órdenes de compra y cuotas por cobrar.
 *
 * Por defecto trae lo de quien mira; `scope=team` (ADMIN+) trae lo de todos.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const from = new Date(url.searchParams.get("from") ?? "");
  const to = new Date(url.searchParams.get("to") ?? "");
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) {
    return NextResponse.json({ error: "Rango inválido" }, { status: 400 });
  }
  if (to.getTime() - from.getTime() > 45 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Rango demasiado largo" }, { status: 400 });
  }

  const me = session.user.id;
  const admin = isAdminRole(session.user.role);
  const team = admin && url.searchParams.get("scope") === "team";
  const range = { gte: from, lt: to };

  try {
    const [calls, visits, tasks, quotes, orders, installments] = await Promise.all([
      prisma.call.findMany({
        where: { scheduledAt: range, ...(team ? {} : { assignedToId: me }) },
        select: { id: true, scheduledAt: true, notes: true, completed: true, contact: { select: contactSelect }, assignedTo: { select: { id: true, name: true } } },
        orderBy: { scheduledAt: "asc" },
      }),
      prisma.visit.findMany({
        where: { scheduledDate: range, ...(team ? {} : { assignedToId: me }) },
        select: { id: true, scheduledDate: true, notes: true, completed: true, contact: { select: contactSelect }, assignedTo: { select: { id: true, name: true } } },
        orderBy: { scheduledDate: "asc" },
      }),
      prisma.crmTask.findMany({
        where: { dueDate: range, ...(team ? {} : { userId: me }) },
        select: { id: true, title: true, dueDate: true, done: true, priority: true, userId: true },
        orderBy: { dueDate: "asc" },
      }),
      prisma.quote.findMany({
        where: { validUntil: range, status: { in: ["DRAFT", "SENT"] }, ...(team || admin ? {} : { userId: me }) },
        select: { id: true, number: true, validUntil: true, contact: { select: contactSelect } },
        orderBy: { validUntil: "asc" },
      }),
      admin
        ? prisma.purchaseOrder.findMany({
            where: { expectedDate: range, status: { not: "RECEIVED" } },
            select: { id: true, number: true, expectedDate: true, supplier: { select: { name: true } } },
            orderBy: { expectedDate: "asc" },
          })
        : Promise.resolve([]),
      admin
        ? prisma.paymentInstallment.findMany({
            where: { dueDate: range, plan: { status: "ACTIVE" } },
            select: {
              id: true, number: true, dueDate: true, amount: true,
              allocations: { select: { amount: true } },
              plan: { select: { installmentCount: true, sale: { select: { id: true, number: true, currency: true, contact: { select: contactSelect } } } } },
            },
            orderBy: { dueDate: "asc" },
          })
        : Promise.resolve([]),
    ]);

    // Nombres de los dueños de tareas, solo hace falta en la vista de equipo.
    const taskOwnerIds = team ? [...new Set(tasks.map((t) => t.userId).filter((x): x is string => !!x))] : [];
    const owners = taskOwnerIds.length
      ? await prisma.user.findMany({ where: { id: { in: taskOwnerIds } }, select: { id: true, name: true } })
      : [];
    const ownerName = new Map(owners.map((u) => [u.id, u.name]));

    const items: AgendaItem[] = [];

    for (const c of calls) {
      items.push({
        id: `call-${c.id}`,
        kind: "call",
        title: `Llamar a ${contactName(c.contact)}`,
        detail: c.notes ?? undefined,
        at: c.scheduledAt.toISOString(),
        allDay: false,
        done: c.completed,
        link: "/calendar/calls",
        owner: c.assignedTo.id === me ? null : c.assignedTo.name,
      });
    }
    for (const v of visits) {
      items.push({
        id: `visit-${v.id}`,
        kind: "visit",
        title: `Visita a ${contactName(v.contact)}`,
        detail: v.notes ?? undefined,
        at: v.scheduledDate.toISOString(),
        allDay: false,
        done: v.completed,
        link: "/calendar/visits",
        owner: v.assignedTo.id === me ? null : v.assignedTo.name,
      });
    }
    for (const t of tasks) {
      items.push({
        id: `task-${t.id}`,
        kind: "task",
        title: t.title,
        detail: t.priority === "HIGH" ? "Prioridad alta" : undefined,
        at: t.dueDate!.toISOString(),
        allDay: isMidnightAR(t.dueDate!),
        done: t.done,
        link: null,
        owner: t.userId && t.userId !== me ? ownerName.get(t.userId) ?? null : null,
      });
    }
    for (const q of quotes) {
      items.push({
        id: `quote-${q.id}`,
        kind: "quote",
        title: `Vence presupuesto #${q.number}`,
        detail: contactName(q.contact),
        at: q.validUntil!.toISOString(),
        allDay: true,
        done: false,
        link: `/quotes/${q.id}`,
      });
    }
    for (const o of orders) {
      items.push({
        id: `po-${o.id}`,
        kind: "purchase",
        title: `Llega OC #${o.number}`,
        detail: o.supplier.name,
        at: o.expectedDate!.toISOString(),
        allDay: true,
        done: false,
        link: `/purchase-orders/${o.id}`,
      });
    }
    for (const i of installments) {
      const paid = i.allocations.reduce((s, a) => s + Number(a.amount), 0);
      const pending = Number(i.amount) - paid;
      if (pending <= 0.009) continue;
      const sale = i.plan.sale;
      const prefix = sale.currency === "USD" ? "US$" : "$";
      items.push({
        id: `inst-${i.id}`,
        kind: "installment",
        title: `Cuota ${i.number}/${i.plan.installmentCount} · ${contactName(sale.contact)}`,
        detail: `${prefix} ${pending.toLocaleString("es-AR", { maximumFractionDigits: 0 })} pendiente · venta #${sale.number}`,
        at: i.dueDate.toISOString(),
        allDay: true,
        done: false,
        link: `/sales/${sale.id}`,
      });
    }

    items.sort((a, b) => a.at.localeCompare(b.at));
    return NextResponse.json({ items });
  } catch (err) {
    log.error({ err }, "Error building agenda");
    return NextResponse.json({ error: "No se pudo cargar la agenda" }, { status: 500 });
  }
}
