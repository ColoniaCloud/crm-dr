import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/lib/brand";
import { formatLocalDate } from "@/lib/agents/schedule";
import { readCollectionsConfig } from "@/lib/agents/collections/config";
import { computeDebts, formatAmount } from "@/lib/agents/collections/debts";

/**
 * Reporte de cobranzas de un período: qué mandó el agente, qué se cobró después
 * de cada aviso, y cómo está la deuda hoy.
 *
 * "Cobrado después del aviso" es la suma de los pagos de esa venta con fecha
 * posterior al envío. No prueba que el aviso haya causado el pago, pero es la
 * mejor medida que hay de si el agente sirve.
 *
 * No lleva emails ni teléfonos: viaja por mail y se descarga.
 */

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Pendiente",
  SENT: "Enviado",
  DISCARDED: "Descartado",
  FAILED: "Falló",
};

export interface CollectionsReport {
  agentName: string;
  from: Date;
  to: Date;
  totals: {
    enviados: number;
    pendientes: number;
    descartados: number;
    fallidos: number;
    cobradoDespues: Record<string, number>;
    ventasQuePagaron: number;
  };
  rows: Array<{
    fecha: string;
    cliente: string;
    venta: string;
    paso: string;
    monto: string;
    estado: string;
    cobradoDespues: string;
  }>;
  deudaHoy: {
    vencidaPorMoneda: Record<string, number>;
    deudas: number;
    escaladas: Array<{ cliente: string; venta: number; monto: string; dias: number }>;
  };
}

export async function buildCollectionsReport(agentId: string, from: Date, to: Date): Promise<CollectionsReport> {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId }, select: { name: true, config: true } });
  const config = readCollectionsConfig(agent.config);

  const acciones = await prisma.agentAction.findMany({
    where: { agentId, createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "asc" },
  });

  const ventaIds = [...new Set(acciones.filter((a) => a.saleId && a.sentAt).map((a) => a.saleId!))];
  const [pagos, ventas] = await Promise.all([
    prisma.payment.findMany({ where: { saleId: { in: ventaIds } }, select: { saleId: true, amount: true, paidAt: true } }),
    prisma.sale.findMany({ where: { id: { in: ventaIds } }, select: { id: true, currency: true } }),
  ]);
  const monedaDe = new Map(ventas.map((v) => [v.id, v.currency as string]));

  const cobradoDespues: Record<string, number> = {};
  const ventasQuePagaron = new Set<string>();
  // Se cuenta cada pago una sola vez, contra el primer aviso enviado de su venta.
  const primerAviso = new Map<string, Date>();
  for (const a of acciones) {
    if (a.saleId && a.sentAt && (!primerAviso.has(a.saleId) || a.sentAt < primerAviso.get(a.saleId)!)) {
      primerAviso.set(a.saleId, a.sentAt);
    }
  }
  const cobradoPorVenta = new Map<string, number>();
  for (const p of pagos) {
    const aviso = primerAviso.get(p.saleId);
    if (!aviso || p.paidAt < aviso) continue;
    cobradoPorVenta.set(p.saleId, (cobradoPorVenta.get(p.saleId) ?? 0) + Number(p.amount));
    const moneda = monedaDe.get(p.saleId) ?? "ARS";
    cobradoDespues[moneda] = (cobradoDespues[moneda] ?? 0) + Number(p.amount);
    ventasQuePagaron.add(p.saleId);
  }

  const etiquetaPaso = new Map(config.steps.map((s) => [s.key, s.label]));
  const rows = acciones.map((a) => {
    const moneda = (a.saleId && monedaDe.get(a.saleId)) || "ARS";
    const cobrado = a.saleId && a.sentAt && primerAviso.get(a.saleId)?.getTime() === a.sentAt.getTime()
      ? cobradoPorVenta.get(a.saleId) ?? 0
      : 0;
    return {
      fecha: formatLocalDate(a.createdAt),
      cliente: a.contactName,
      venta: a.saleNumber ? `#${a.saleNumber}` : "-",
      paso: a.origin === "CHAT" ? "Pedido por chat" : etiquetaPaso.get(a.step ?? "") ?? a.step ?? "-",
      monto: a.amount ? formatAmount(Number(a.amount), moneda) : "-",
      estado: (STATUS_LABEL[a.status] ?? a.status) + (a.simulated ? " (simulado)" : ""),
      cobradoDespues: cobrado > 0 ? formatAmount(cobrado, moneda) : "-",
    };
  });

  const deudas = await computeDebts(config);
  const vencidaPorMoneda: Record<string, number> = {};
  for (const d of deudas) {
    if (d.daysPastDue > 0) vencidaPorMoneda[d.currency] = (vencidaPorMoneda[d.currency] ?? 0) + d.amount;
  }

  return {
    agentName: agent.name,
    from,
    to,
    totals: {
      enviados: acciones.filter((a) => a.status === "SENT").length,
      pendientes: acciones.filter((a) => a.status === "PENDING_APPROVAL").length,
      descartados: acciones.filter((a) => a.status === "DISCARDED").length,
      fallidos: acciones.filter((a) => a.status === "FAILED").length,
      cobradoDespues,
      ventasQuePagaron: ventasQuePagaron.size,
    },
    rows,
    deudaHoy: {
      vencidaPorMoneda,
      deudas: deudas.filter((d) => d.daysPastDue > 0).length,
      escaladas: deudas
        .filter((d) => d.skip === "ESCALATED")
        .map((d) => ({ cliente: d.contactName, venta: d.saleNumber, monto: formatAmount(d.amount, d.currency), dias: d.daysPastDue })),
    },
  };
}

export function montos(porMoneda: Record<string, number>): string {
  const partes = Object.entries(porMoneda).map(([m, v]) => formatAmount(v, m));
  return partes.length ? partes.join(" + ") : formatAmount(0, "ARS");
}

function csvCell(v: string): string {
  return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV con separador `;` y BOM: es lo que Excel en español abre sin preguntar. */
export function reportToCsv(r: CollectionsReport): string {
  const encabezado = ["Fecha", "Cliente", "Venta", "Paso", "Monto", "Estado", "Cobrado después"];
  const lineas = [encabezado, ...r.rows.map((x) => [x.fecha, x.cliente, x.venta, x.paso, x.monto, x.estado, x.cobradoDespues])];
  return "﻿" + lineas.map((l) => l.map(csvCell).join(";")).join("\r\n");
}

export function reportToPdf(r: CollectionsReport): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`Reporte de cobranzas — ${r.agentName}`, 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${BRAND.name} · del ${formatLocalDate(r.from)} al ${formatLocalDate(r.to)}`, 14, 25);

  const resumen = [
    ["Avisos enviados", String(r.totals.enviados)],
    ["Esperando aprobación", String(r.totals.pendientes)],
    ["Descartados", String(r.totals.descartados)],
    ["Fallidos", String(r.totals.fallidos)],
    ["Cobrado después de un aviso", `${montos(r.totals.cobradoDespues)} (${r.totals.ventasQuePagaron} venta/s)`],
    ["Deuda vencida hoy", `${montos(r.deudaHoy.vencidaPorMoneda)} (${r.deudaHoy.deudas} deuda/s)`],
    ["Para seguimiento personal", String(r.deudaHoy.escaladas.length)],
  ];
  autoTable(doc, {
    startY: 31,
    body: resumen,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 70 } },
  });

  const despuesResumen = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: despuesResumen,
    head: [["Fecha", "Cliente", "Venta", "Paso", "Monto", "Estado", "Cobrado después"]],
    body: r.rows.length ? r.rows.map((x) => [x.fecha, x.cliente, x.venta, x.paso, x.monto, x.estado, x.cobradoDespues]) : [["—", "Sin movimientos en el período", "", "", "", "", ""]],
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [17, 24, 39] },
  });

  if (r.deudaHoy.escaladas.length) {
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Para seguimiento personal (el agente ya no les escribe)", 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Cliente", "Venta", "Monto", "Días vencido"]],
      body: r.deudaHoy.escaladas.map((e) => [e.cliente, `#${e.venta}`, e.monto, String(e.dias)]),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [17, 24, 39] },
    });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
