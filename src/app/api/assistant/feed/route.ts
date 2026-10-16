import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { isAdminRole } from "@/lib/crm-tasks";
import type { FeedEvent } from "@/types/assistant-panel";

const log = createLogger("api/assistant/feed");

/** Cuánto para atrás mira el ticker, y cuántas filas trae de cada fuente. */
const WINDOW_DAYS = 7;
const PER_SOURCE = 15;
const MAX_EVENTS = 50;

function contactName(c: { firstName: string; lastName: string; company: string | null } | null | undefined): string {
  if (!c) return "—";
  return c.company || `${c.firstName} ${c.lastName}`.trim() || "—";
}

function money(amount: unknown, currency: string): string {
  const n = Number(amount);
  const prefix = currency === "USD" ? "US$" : "$";
  return `${prefix} ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

const contactSelect = { firstName: true, lastName: true, company: true } as const;

const METHOD_LABELS: Record<string, string> = { PHONE: "por teléfono", WHATSAPP: "por WhatsApp", EMAIL: "por email" };

/**
 * GET /api/assistant/feed — últimos eventos del CRM para el ticker de la página
 * del asistente.
 *
 * Se arma leyendo cada tabla de negocio en vez de la auditoría de operadores,
 * porque la mitad de lo que interesa no lo hace un operador: los leads que
 * entran por la web, las garantías que activa el cliente final, los remitos que
 * se firman desde el link público.
 *
 * Un OPERATOR ve solo lo suyo: sus ventas y los pagos sobre ellas, sus
 * contactos asignados, lo que registró él y los reclamos que tiene asignados.
 * Stock, compras y activaciones de garantía son solo de ADMIN+.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const me = session.user.id;
  const admin = isAdminRole(session.user.role);
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  try {
    const [
      sales,
      cancelledSales,
      payments,
      returns,
      leads,
      conversions,
      activities,
      activations,
      claims,
      remitos,
      movements,
      receivedOrders,
    ] = await Promise.all([
      prisma.sale.findMany({
        where: { createdAt: { gte: since }, ...(admin ? {} : { userId: me }) },
        select: { id: true, number: true, total: true, currency: true, createdAt: true, contact: { select: contactSelect }, user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE,
      }),
      prisma.sale.findMany({
        where: { status: "CANCELLED", updatedAt: { gte: since }, ...(admin ? {} : { userId: me }) },
        select: { id: true, number: true, updatedAt: true, contact: { select: contactSelect } },
        orderBy: { updatedAt: "desc" },
        take: PER_SOURCE,
      }),
      prisma.payment.findMany({
        where: { createdAt: { gte: since }, ...(admin ? {} : { sale: { userId: me } }) },
        select: { id: true, amount: true, currency: true, createdAt: true, contact: { select: contactSelect }, sale: { select: { id: true, number: true } } },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE,
      }),
      prisma.saleReturn.findMany({
        where: { createdAt: { gte: since }, ...(admin ? {} : { userId: me }) },
        select: { id: true, number: true, total: true, currency: true, createdAt: true, contact: { select: contactSelect }, sale: { select: { id: true, number: true } } },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE,
      }),
      prisma.contact.findMany({
        where: { type: "LEAD", createdAt: { gte: since }, ...(admin ? {} : { assignedToId: me }) },
        select: { id: true, firstName: true, lastName: true, company: true, city: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE,
      }),
      prisma.operatorAuditLog.findMany({
        where: {
          action: { in: ["LEAD_CONVERTED", "CONVERT_LEAD"] },
          createdAt: { gte: since },
          ...(admin ? {} : { userId: me }),
        },
        select: { id: true, entityId: true, description: true, createdAt: true, link: true, user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE,
      }),
      prisma.activityLog.findMany({
        where: { createdAt: { gte: since }, ...(admin ? {} : { userId: me }) },
        select: { id: true, contactId: true, contactMethod: true, interestLevel: true, createdAt: true, contact: { select: contactSelect }, user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE,
      }),
      admin
        ? prisma.warrantyInstallation.findMany({
            where: { activatedAt: { gte: since } },
            select: { id: true, installationCode: true, clientName: true, activatedAt: true },
            orderBy: { activatedAt: "desc" },
            take: PER_SOURCE,
          })
        : Promise.resolve([]),
      prisma.warrantyClaim.findMany({
        where: { createdAt: { gte: since }, ...(admin ? {} : { assignedToId: me }) },
        select: { id: true, reporterName: true, createdAt: true, installation: { select: { installationCode: true } } },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE,
      }),
      prisma.remito.findMany({
        where: { signedAt: { gte: since }, ...(admin ? {} : { sale: { userId: me } }) },
        select: { id: true, number: true, signedAt: true, signedByName: true, sale: { select: { id: true, number: true, contact: { select: contactSelect } } } },
        orderBy: { signedAt: "desc" },
        take: PER_SOURCE,
      }),
      admin
        ? prisma.stockMovement.findMany({
            where: { createdAt: { gte: since } },
            select: {
              id: true, type: true, quantity: true, stockBefore: true, stockAfter: true, referenceType: true, createdAt: true,
              product: { select: { id: true, name: true, minStock: true } },
              user: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 60,
          })
        : Promise.resolve([]),
      admin
        ? prisma.purchaseOrder.findMany({
            where: { receivedDate: { gte: since } },
            select: { id: true, number: true, receivedDate: true, supplier: { select: { name: true } } },
            orderBy: { receivedDate: "desc" },
            take: PER_SOURCE,
          })
        : Promise.resolve([]),
    ]);

    const events: FeedEvent[] = [];

    for (const s of sales) {
      events.push({
        id: `sale-${s.id}`,
        category: "sales",
        title: `Venta #${s.number} a ${contactName(s.contact)}`,
        detail: `${money(s.total, s.currency)} · ${s.user?.name ?? ""}`.trim(),
        at: s.createdAt.toISOString(),
        link: `/sales/${s.id}`,
        ask: `Contame de la venta #${s.number}`,
      });
    }
    for (const s of cancelledSales) {
      events.push({
        id: `sale-cancel-${s.id}`,
        category: "sales",
        tone: "warning",
        title: `Venta #${s.number} anulada`,
        detail: contactName(s.contact),
        at: s.updatedAt.toISOString(),
        link: `/sales/${s.id}`,
        ask: `Contame de la venta #${s.number}`,
      });
    }
    for (const p of payments) {
      events.push({
        id: `payment-${p.id}`,
        category: "sales",
        title: `Pago de ${contactName(p.contact)}`,
        detail: `${money(p.amount, p.currency)} · venta #${p.sale.number}`,
        at: p.createdAt.toISOString(),
        link: `/sales/${p.sale.id}`,
        ask: `Mostrame la venta #${p.sale.number} y lo que tiene pagado`,
      });
    }
    for (const r of returns) {
      events.push({
        id: `return-${r.id}`,
        category: "sales",
        tone: "warning",
        title: `Devolución #${r.number} de ${contactName(r.contact)}`,
        detail: `${money(r.total, r.currency)} · venta #${r.sale.number}`,
        at: r.createdAt.toISOString(),
        link: `/sales/${r.sale.id}`,
        ask: `Contame de la venta #${r.sale.number}`,
      });
    }
    for (const c of leads) {
      const name = contactName(c);
      events.push({
        id: `lead-${c.id}`,
        category: "leads",
        title: `Lead nuevo: ${name}`,
        detail: c.city ?? "",
        at: c.createdAt.toISOString(),
        link: `/leads/${c.id}`,
        ask: `Buscá el contacto ${name}`,
      });
    }
    for (const a of conversions) {
      events.push({
        id: `convert-${a.id}`,
        category: "leads",
        tone: "success",
        title: "Lead convertido en cliente",
        detail: a.description,
        at: a.createdAt.toISOString(),
        link: a.link ?? (a.entityId ? `/clients/${a.entityId}` : null),
        ask: `${a.description}. ¿Qué más sabés de ese cliente?`,
      });
    }
    for (const a of activities) {
      const name = contactName(a.contact);
      events.push({
        id: `activity-${a.id}`,
        category: "leads",
        title: `${a.user?.name ?? "Alguien"} contactó a ${name}`,
        detail: [METHOD_LABELS[a.contactMethod] ?? a.contactMethod, `interés ${a.interestLevel.toLowerCase()}`].join(" · "),
        at: a.createdAt.toISOString(),
        link: null,
        ask: `Buscá el contacto ${name}`,
      });
    }
    for (const w of activations) {
      events.push({
        id: `activation-${w.id}`,
        category: "warranty",
        tone: "success",
        title: `Garantía activada ${w.installationCode}`,
        detail: w.clientName ?? "",
        at: w.activatedAt!.toISOString(),
        link: "/warranty-claims",
        ask: `Buscá el rollo de garantía ${w.installationCode}`,
      });
    }
    for (const c of claims) {
      events.push({
        id: `claim-${c.id}`,
        category: "warranty",
        tone: "warning",
        title: `Reclamo de garantía ${c.installation.installationCode}`,
        detail: c.reporterName,
        at: c.createdAt.toISOString(),
        link: "/warranty-claims",
        ask: `Mostrame el reclamo de garantía de ${c.installation.installationCode}`,
      });
    }
    for (const r of remitos) {
      events.push({
        id: `remito-${r.id}`,
        category: "warranty",
        tone: "success",
        title: `Remito #${r.number} firmado`,
        detail: [contactName(r.sale.contact), r.signedByName].filter(Boolean).join(" · "),
        at: r.signedAt!.toISOString(),
        link: `/sales/${r.sale.id}`,
        ask: `Contame de la venta #${r.sale.number}`,
      });
    }
    for (const m of movements) {
      const min = m.product.minStock;
      if (min > 0 && m.stockAfter <= min && m.stockBefore > min) {
        events.push({
          id: `lowstock-${m.id}`,
          category: "stock",
          tone: "warning",
          title: `Stock bajo: ${m.product.name}`,
          detail: `Quedan ${m.stockAfter} (mínimo ${min})`,
          at: m.createdAt.toISOString(),
          link: `/products/${m.product.id}`,
          ask: `¿Cuánto stock queda de ${m.product.name}?`,
        });
      }
      // Las salidas por venta ya aparecen como venta, y las entradas por orden
      // de compra como "orden recibida": acá solo los movimientos a mano.
      const manual = m.type === "AJUSTE" || (m.type === "ENTRADA" && m.referenceType !== "PURCHASE_ORDER");
      if (manual) {
        events.push({
          id: `movement-${m.id}`,
          category: "stock",
          title: `${m.type === "AJUSTE" ? "Ajuste" : "Entrada"} de stock: ${m.product.name}`,
          detail: `${m.quantity > 0 ? "+" : ""}${m.quantity} → ${m.stockAfter}${m.user?.name ? ` · ${m.user.name}` : ""}`,
          at: m.createdAt.toISOString(),
          link: `/products/${m.product.id}`,
          ask: `¿Cuánto stock queda de ${m.product.name}?`,
        });
      }
    }
    for (const o of receivedOrders) {
      events.push({
        id: `po-${o.id}`,
        category: "stock",
        tone: "success",
        title: `Orden de compra #${o.number} recibida`,
        detail: o.supplier.name,
        at: o.receivedDate!.toISOString(),
        link: `/purchase-orders/${o.id}`,
        ask: `Llevame a las órdenes de compra`,
      });
    }

    events.sort((a, b) => b.at.localeCompare(a.at));
    return NextResponse.json({ events: events.slice(0, MAX_EVENTS) });
  } catch (err) {
    log.error({ err }, "Error building feed");
    return NextResponse.json({ error: "No se pudo cargar la actividad" }, { status: 500 });
  }
}
