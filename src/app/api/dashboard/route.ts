import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/dashboard");

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const userRole = session?.user?.role ?? "OPERATOR";

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twelveWeeksAgo = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000);

    const isSuperAdmin = userRole === "SUPERADMIN";

    const [
      totalLeads,
      totalClients,
      salesThisMonth,
      allSales,
      recentSales,
      monthlySalesRaw,
      dailySalesRaw,
      weeklySalesRaw,
      upcomingVisits,
      pendingVisits,
      contactedLeads,
      // Leads stats for OPERATOR/ADMIN dashboard
      monthlyLeadsGenerated,
      monthlyLeadsContacted,
      leadsMonthlyRaw,
      leadsDailyRaw,
      leadsWeeklyRaw,
    ] = await Promise.all([
      prisma.contact.count({ where: { type: "LEAD" } }),
      prisma.contact.count({ where: { type: "CLIENT" } }),
      // Sales queries — only fetch if SUPERADMIN
      isSuperAdmin
        ? prisma.sale.findMany({ where: { createdAt: { gte: startOfMonth } } })
        : Promise.resolve([]),
      isSuperAdmin
        ? prisma.sale.findMany({ include: { payments: true } })
        : Promise.resolve([]),

      // Recent sales (remitos) — only if SUPERADMIN
      isSuperAdmin
        ? prisma.sale.findMany({
            take: 8,
            include: {
              contact: { select: { id: true, firstName: true, lastName: true, company: true } },
              payments: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),

      // Monthly data (last 6 months)
      isSuperAdmin
        ? prisma.sale.findMany({
            where: { createdAt: { gte: sixMonthsAgo } },
            select: { total: true, createdAt: true },
          })
        : Promise.resolve([]),

      // Daily data (last 30 days)
      isSuperAdmin
        ? prisma.sale.findMany({
            where: { createdAt: { gte: thirtyDaysAgo } },
            select: { total: true, createdAt: true },
          })
        : Promise.resolve([]),

      // Weekly data (last 12 weeks)
      isSuperAdmin
        ? prisma.sale.findMany({
            where: { createdAt: { gte: twelveWeeksAgo } },
            select: { total: true, createdAt: true },
          })
        : Promise.resolve([]),

      // Upcoming visits in next 24h for current user
      userId
        ? prisma.visit.findMany({
            where: {
              assignedToId: userId,
              completed: false,
              scheduledDate: { gte: now, lte: in24h },
            },
            include: {
              contact: { select: { id: true, firstName: true, lastName: true, company: true } },
              assignedTo: { select: { id: true, name: true } },
            },
            orderBy: { scheduledDate: "asc" },
          })
        : Promise.resolve([]),

      // Pending visits (all future, not completed) — agenda section
      prisma.visit.findMany({
        where: { completed: false, scheduledDate: { gte: now } },
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, company: true } },
          assignedTo: { select: { id: true, name: true } },
        },
        orderBy: { scheduledDate: "asc" },
        take: 8,
      }),

      // Recently contacted leads
      prisma.contact.findMany({
        where: { type: "LEAD", contacted: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          contactMethod: true,
          contactDate: true,
        },
        orderBy: { contactDate: "desc" },
        take: 8,
      }),

      // Leads generated this month
      prisma.contact.count({
        where: { type: "LEAD", createdAt: { gte: startOfMonth } },
      }),

      // Leads contacted this month
      prisma.contact.count({
        where: { type: "LEAD", contacted: true, contactDate: { gte: startOfMonth } },
      }),

      // Leads created monthly (last 6 months)
      prisma.contact.findMany({
        where: { type: "LEAD", createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
      }),

      // Leads created daily (last 30 days)
      prisma.contact.findMany({
        where: { type: "LEAD", createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
      }),

      // Leads created weekly (last 12 weeks)
      prisma.contact.findMany({
        where: { type: "LEAD", createdAt: { gte: twelveWeeksAgo } },
        select: { createdAt: true },
      }),
    ]);

    // Totals
    const totalSalesThisMonth = salesThisMonth.length;
    const totalRevenueThisMonth = salesThisMonth.reduce((s, x) => s + Number(x.total), 0);
    const pendingPaymentsAmount = allSales.reduce((s, sale) => {
      const paid = sale.payments.reduce((ps, p) => ps + Number(p.amount), 0);
      const rem = Number(sale.total) - paid;
      return s + (rem > 0 ? rem : 0);
    }, 0);

    // Low stock
    const lowStockCount = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM products WHERE active = true AND stock <= minStock
    `;

    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    // ── Sales chart data (SUPERADMIN only) ──
    let monthlyData: { month: string; revenue: number }[] = [];
    let dailyData: { day: string; revenue: number }[] = [];
    let weeklyData: { week: string; revenue: number }[] = [];

    if (isSuperAdmin) {
      // Monthly chart data
      const monthlyMap: Record<string, { month: string; revenue: number }> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyMap[key] = { month: monthNames[d.getMonth()], revenue: 0 };
      }
      for (const s of monthlySalesRaw) {
        const d = new Date(s.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (monthlyMap[key]) monthlyMap[key].revenue += Number(s.total);
      }
      monthlyData = Object.values(monthlyMap);

      // Daily chart data (last 30 days)
      const dailyMap: Record<string, { day: string; revenue: number }> = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        dailyMap[key] = { day: `${d.getDate()}/${d.getMonth() + 1}`, revenue: 0 };
      }
      for (const s of dailySalesRaw) {
        const d = new Date(s.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (dailyMap[key]) dailyMap[key].revenue += Number(s.total);
      }
      dailyData = Object.values(dailyMap);

      // Weekly chart data (last 12 weeks)
      const weeklyMap: Record<number, { week: string; revenue: number }> = {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        const weekNum = 12 - i;
        weeklyMap[12 - i] = { week: `S${weekNum} ${d.getDate()}/${d.getMonth() + 1}`, revenue: 0 };
      }
      for (const s of weeklySalesRaw) {
        const d = new Date(s.createdAt);
        const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        const weekIdx = 11 - Math.floor(diffDays / 7);
        if (weekIdx >= 0 && weekIdx <= 11) weeklyMap[weekIdx + 1].revenue += Number(s.total);
      }
      weeklyData = Object.values(weeklyMap);
    }

    // ── Leads chart data (OPERATOR/ADMIN dashboard) ──
    // Monthly leads
    const leadsMonthlyMap: Record<string, { month: string; count: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      leadsMonthlyMap[key] = { month: monthNames[d.getMonth()], count: 0 };
    }
    for (const l of leadsMonthlyRaw) {
      const d = new Date(l.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (leadsMonthlyMap[key]) leadsMonthlyMap[key].count++;
    }

    // Daily leads
    const leadsDailyMap: Record<string, { day: string; count: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      leadsDailyMap[key] = { day: `${d.getDate()}/${d.getMonth() + 1}`, count: 0 };
    }
    for (const l of leadsDailyRaw) {
      const d = new Date(l.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (leadsDailyMap[key]) leadsDailyMap[key].count++;
    }

    // Weekly leads
    const leadsWeeklyMap: Record<number, { week: string; count: number }> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const weekNum = 12 - i;
      leadsWeeklyMap[12 - i] = { week: `S${weekNum} ${d.getDate()}/${d.getMonth() + 1}`, count: 0 };
    }
    for (const l of leadsWeeklyRaw) {
      const d = new Date(l.createdAt);
      const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      const weekIdx = 11 - Math.floor(diffDays / 7);
      if (weekIdx >= 0 && weekIdx <= 11) leadsWeeklyMap[weekIdx + 1].count++;
    }

    return NextResponse.json({
      userRole,
      totalLeads,
      totalClients,
      monthlySales: totalSalesThisMonth,
      monthlyRevenue: totalRevenueThisMonth,
      pendingPayments: pendingPaymentsAmount,
      lowStockProducts: Number(lowStockCount[0].count),
      recentSales,
      monthlyData,
      dailyData,
      weeklyData,
      upcomingVisits,
      pendingVisits,
      contactedLeads,
      // Leads stats
      monthlyLeadsGenerated,
      monthlyLeadsContacted,
      leadsMonthlyData: Object.values(leadsMonthlyMap),
      leadsDailyData: Object.values(leadsDailyMap),
      leadsWeeklyData: Object.values(leadsWeeklyMap),
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching dashboard data");
    return NextResponse.json({ error: "Error fetching dashboard data" }, { status: 500 });
  }
}
