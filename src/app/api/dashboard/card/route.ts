import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { periodRange, type PeriodType } from "@/lib/dashboard-periods";
import { canSeeCollections, canSeeSalesTotals } from "@/lib/money-visibility";

const log = createLogger("api/dashboard/card");

/**
 * El valor de UNA card del dashboard para UN período (semana o mes).
 *
 *   GET /api/dashboard/card?metric=collected&period=month&key=2026-10
 *
 * Cada card pide lo suyo por separado, así cambiar el período de una no
 * recarga las demás. Lo que cada rol puede pedir está en `METRIC_ACCESS`, y se
 * controla acá — esconder la card en la pantalla no alcanza.
 *
 * Las ventas anuladas no cuentan en nada: no son venta ni deuda (mismo
 * criterio que la cuenta corriente, `DEUDA_EXCLUIDA` en lib/account.ts).
 */

type Metric =
  | "visits"
  | "clients"
  | "salesCount"
  | "revenue"
  | "collected"
  | "pending"
  | "leadsTotal"
  | "leadsNew"
  | "leadsContacted";

const METRIC_ACCESS: Record<Metric, (role: string) => boolean> = {
  visits: () => true,
  clients: () => true,
  leadsTotal: () => true,
  leadsNew: () => true,
  leadsContacted: () => true,
  // Totales agregados de ventas: solo SUPERADMIN (ver lib/money-visibility.ts).
  salesCount: canSeeSalesTotals,
  revenue: canSeeSalesTotals,
  // Cobros y saldo: ADMIN y SUPERADMIN.
  collected: canSeeCollections,
  pending: canSeeCollections,
};

const NOT_CANCELLED = { status: { not: "CANCELLED" as const } };

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const role = session.user.role ?? "OPERATOR";

  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric") as Metric | null;
  const period = (searchParams.get("period") === "week" ? "week" : "month") as PeriodType;
  const key = searchParams.get("key") ?? "";

  if (!metric || !(metric in METRIC_ACCESS)) {
    return NextResponse.json({ error: "Métrica inválida" }, { status: 400 });
  }
  if (!METRIC_ACCESS[metric](role)) {
    return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
  }
  const range = periodRange(period, key);
  if (!range) return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  const inRange = { gte: range.from, lt: range.to };

  try {
    switch (metric) {
      case "visits": {
        const [inPeriod, pendingNow] = await Promise.all([
          prisma.visit.count({ where: { completed: false, scheduledDate: inRange } }),
          prisma.visit.count({ where: { completed: false, scheduledDate: { gte: new Date() } } }),
        ]);
        return NextResponse.json({ value: inPeriod, sub: `${pendingNow} próximas en total` });
      }
      case "clients": {
        const [nuevos, total] = await Promise.all([
          prisma.contact.count({ where: { type: "CLIENT", createdAt: inRange } }),
          prisma.contact.count({ where: { type: "CLIENT" } }),
        ]);
        return NextResponse.json({ value: nuevos, sub: `${total} clientes totales` });
      }
      case "leadsTotal": {
        const [total, nuevos] = await Promise.all([
          prisma.contact.count({ where: { type: "LEAD" } }),
          prisma.contact.count({ where: { type: "LEAD", createdAt: inRange } }),
        ]);
        return NextResponse.json({ value: total, sub: `+${nuevos} en el período` });
      }
      case "leadsNew": {
        const value = await prisma.contact.count({ where: { type: "LEAD", createdAt: inRange } });
        return NextResponse.json({ value, sub: "Generados en el período" });
      }
      case "leadsContacted": {
        const value = await prisma.contact.count({ where: { type: "LEAD", contacted: true, contactDate: inRange } });
        return NextResponse.json({ value, sub: "Contactados en el período" });
      }
      case "salesCount": {
        const value = await prisma.sale.count({ where: { ...NOT_CANCELLED, createdAt: inRange } });
        return NextResponse.json({ value, sub: "Operaciones" });
      }
      case "revenue": {
        const agg = await prisma.sale.aggregate({ where: { ...NOT_CANCELLED, createdAt: inRange }, _sum: { total: true }, _count: true });
        return NextResponse.json({ value: Number(agg._sum.total ?? 0), sub: `${agg._count} ventas`, currency: true });
      }
      case "collected": {
        // Lo que entró en el período, por fecha de pago — no por fecha de la venta.
        const agg = await prisma.payment.aggregate({
          where: { paidAt: inRange, sale: NOT_CANCELLED },
          _sum: { amount: true },
          _count: true,
        });
        return NextResponse.json({
          value: Number(agg._sum.amount ?? 0),
          sub: `${agg._count} ${agg._count === 1 ? "pago" : "pagos"}`,
          currency: true,
        });
      }
      case "pending": {
        // Lo que falta cobrar de las ventas hechas en el período (mismo criterio
        // que la capa "Saldo pendiente" del gráfico), y abajo la deuda total.
        const [periodSales, allSales] = await Promise.all([
          prisma.sale.findMany({
            where: { ...NOT_CANCELLED, createdAt: inRange },
            select: { total: true, payments: { select: { amount: true } } },
          }),
          prisma.sale.findMany({
            where: NOT_CANCELLED,
            select: { total: true, payments: { select: { amount: true } } },
          }),
        ]);
        const remaining = (sales: typeof periodSales) =>
          sales.reduce((s, sale) => {
            const paid = sale.payments.reduce((ps, p) => ps + Number(p.amount), 0);
            return s + Math.max(0, Number(sale.total) - paid);
          }, 0);
        return NextResponse.json({ value: remaining(periodSales), subAmount: remaining(allSales), currency: true });
      }
    }
  } catch (error) {
    log.error({ err: error, metric }, "Error computing dashboard card");
    return NextResponse.json({ error: "Error al calcular" }, { status: 500 });
  }
}
