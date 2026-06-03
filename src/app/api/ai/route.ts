import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSalesSummary, detectOpportunities } from "@/lib/ai";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/ai");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "API key not configured. Please set ANTHROPIC_API_KEY in environment variables." },
        { status: 503 }
      );
    }

    if (action === "summary") {
      // Fetch sales from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const sales = await prisma.sale.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
        include: {
          contact: {
            select: { firstName: true, lastName: true, company: true },
          },
          items: {
            include: {
              product: {
                select: { name: true, category: true, price: true },
              },
            },
          },
          payments: true,
        },
        orderBy: { createdAt: "desc" },
      });

      const salesData = JSON.stringify(
        sales.map((sale) => ({
          number: sale.number,
          date: sale.createdAt,
          client: `${sale.contact.firstName} ${sale.contact.lastName}${sale.contact.company ? ` (${sale.contact.company})` : ""}`,
          total: Number(sale.total),
          status: sale.status,
          items: sale.items.map((item) => ({
            product: item.product.name,
            category: item.product.category,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            total: Number(item.total),
          })),
          totalPaid: sale.payments.reduce(
            (sum, p) => sum + Number(p.amount),
            0
          ),
        })),
        null,
        2
      );

      const summary = await generateSalesSummary(salesData);
      return NextResponse.json({ result: summary });
    }

    if (action === "opportunities") {
      // Fetch client and product data
      const [clients, products] = await Promise.all([
        prisma.contact.findMany({
          where: { type: "CLIENT" },
          include: {
            sales: {
              include: {
                items: {
                  include: {
                    product: { select: { name: true, category: true } },
                  },
                },
              },
            },
          },
        }),
        prisma.product.findMany({
          where: { active: true },
        }),
      ]);

      const clientData = JSON.stringify(
        clients.map((client) => ({
          name: `${client.firstName} ${client.lastName}`,
          company: client.company,
          city: client.city,
          vehicleFlowWeekly: client.vehicleFlowWeekly,
          architecturalFlowMonthly: client.architecturalFlowMonthly,
          totalSales: client.sales.length,
          totalSpent: client.sales.reduce(
            (sum, sale) => sum + Number(sale.total),
            0
          ),
          productsBought: client.sales.flatMap((sale) =>
            sale.items.map((item) => ({
              product: item.product.name,
              category: item.product.category,
              quantity: item.quantity,
            }))
          ),
        })),
        null,
        2
      );

      const productData = JSON.stringify(
        products.map((product) => ({
          name: product.name,
          category: product.category,
          brand: product.brand,
          price: Number(product.price),
          stock: product.stock,
          minStock: product.minStock,
          lowStock: product.stock <= product.minStock,
        })),
        null,
        2
      );

      const opportunities = await detectOpportunities(clientData, productData);
      return NextResponse.json({ result: opportunities });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'summary' or 'opportunities'" },
      { status: 400 }
    );
  } catch (error) {
    log.error({ err: error }, "Error in AI route");
    return NextResponse.json(
      { error: "Error processing AI request" },
      { status: 500 }
    );
  }
}
