import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { chartBuckets } from "@/lib/dashboard-periods";
import { canSeeCollections, canSeeSalesTotals } from "@/lib/money-visibility";

const log = createLogger("api/dashboard/finance");

/**
 * Gráfico Ventas / Monto cobrado / Saldo pendiente del dashboard.
 *
 *   GET /api/dashboard/finance?granularity=month&count=6
 *
 * Las tres series se miden sobre **las ventas hechas en cada período**:
 * - ventas  = total de esas ventas
 * - cobrado = lo que ya se cobró de esas ventas (hasta su total)
 * - saldo   = lo que todavía falta cobrar de esas ventas
 *
 * Así `ventas = cobrado + saldo` en cada barra y se comparan directo. Ojo que
 * "cobrado" acá NO es la card de Cobros: la card suma lo que entró en el
 * período por fecha de pago; esta serie mira de qué ventas es la plata.
 *
 * ADMIN recibe cobrado y saldo, pero no `ventas` (lib/money-visibility.ts). La
 * serie se omite del JSON, no solo de la pantalla.
 */

const LIMITS = { month: 24, week: 52, day: 90 } as const;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const role = session.user.role ?? "OPERATOR";
  if (!canSeeCollections(role)) return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
  const includeSales = canSeeSalesTotals(role);

  const { searchParams } = new URL(request.url);
  const g = searchParams.get("granularity");
  const granularity = g === "week" || g === "day" ? g : "month";
  const count = Math.min(LIMITS[granularity], Math.max(1, parseInt(searchParams.get("count") || "6", 10) || 6));

  try {
    const buckets = chartBuckets(granularity, count);
    const sales = await prisma.sale.findMany({
      where: {
        status: { not: "CANCELLED" },
        createdAt: { gte: buckets[0].from, lt: buckets[buckets.length - 1].to },
      },
      select: { total: true, createdAt: true, payments: { select: { amount: true } } },
    });

    const points = buckets.map((b) => ({ label: b.label, from: b.from.toISOString(), ventas: 0, cobrado: 0, saldo: 0 }));
    for (const s of sales) {
      const t = s.createdAt.getTime();
      const idx = buckets.findIndex((b) => t >= b.from.getTime() && t < b.to.getTime());
      if (idx < 0) continue;
      const total = Number(s.total);
      const paid = s.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      points[idx].ventas += total;
      points[idx].cobrado += Math.min(total, paid);
      points[idx].saldo += Math.max(0, total - paid);
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    return NextResponse.json({
      granularity,
      includeSales,
      points: points.map((p) => ({
        label: p.label,
        from: p.from,
        ...(includeSales ? { ventas: round(p.ventas) } : {}),
        cobrado: round(p.cobrado),
        saldo: round(p.saldo),
      })),
    });
  } catch (error) {
    log.error({ err: error }, "Error computing finance chart");
    return NextResponse.json({ error: "Error al calcular el gráfico" }, { status: 500 });
  }
}
