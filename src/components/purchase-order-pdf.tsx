"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BRAND } from "@/lib/brand";

export interface PurchaseOrderPDFData {
  number: number;
  orderDate: string;
  expectedDate?: string | null;
  currency: string;
  notes?: string | null;
  supplier: {
    name: string;
    country?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
  };
  items: Array<{
    product: { name: string; sku: string | null; factoryCode: string | null };
    quantity: number;
    costFOB: number | string;
  }>;
}

function fmt(n: number | string, currency: string) {
  const symbol = currency === "USD" ? "US$" : "$";
  return `${symbol}${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("No se pudo cargar el logo"));
    img.src = url;
  });
}

export async function generatePurchaseOrderPDF(order: PurchaseOrderPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const margin = 15;

  // Load logo
  try {
    const logoBase64 = await loadImageAsBase64(BRAND.emailLogo);
    doc.addImage(logoBase64, "PNG", margin, 10, 40, 15);
  } catch {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(BRAND.name, margin, 20);
  }

  // Date top-right
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Generado el: ${new Date().toLocaleDateString("es-AR")}`, W - margin, 18, { align: "right" });
  doc.text(`Orden de Compra #${order.number}`, W - margin, 24, { align: "right" });

  // Horizontal line
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(margin, 32, W - margin, 32);

  // Supplier data block
  let y = 38;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Proveedor", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  y += 5; doc.text(order.supplier.name, margin, y);
  if (order.supplier.country) { y += 4; doc.text(order.supplier.country, margin, y); }
  if (order.supplier.contactName) { y += 4; doc.text(order.supplier.contactName, margin, y); }
  if (order.supplier.contactEmail) { y += 4; doc.text(order.supplier.contactEmail, margin, y); }
  if (order.supplier.contactPhone) { y += 4; doc.text(order.supplier.contactPhone, margin, y); }

  // Order data block (right column)
  let yr = 38;
  const rX = W - margin - 60;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Datos de la orden", rX, yr);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  yr += 5; doc.text(`Fecha: ${new Date(order.orderDate).toLocaleDateString("es-AR")}`, rX, yr);
  if (order.expectedDate) { yr += 4; doc.text(`ETA estimada: ${new Date(order.expectedDate).toLocaleDateString("es-AR")}`, rX, yr); }
  yr += 4; doc.text(`Moneda: ${order.currency}`, rX, yr);

  y = Math.max(y, yr) + 8;

  // Items table
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Código de fábrica", "Código interno", "Producto", "Cantidad", `Costo FOB (${order.currency})`, "Total"]],
    body: order.items.map((item) => {
      const factoryLabel = item.product.factoryCode || item.product.sku || item.product.name;
      return [
        factoryLabel,
        item.product.sku ?? "—",
        item.product.name,
        item.quantity.toString(),
        fmt(item.costFOB, order.currency),
        fmt(Number(item.costFOB) * item.quantity, order.currency),
      ];
    }),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 250] },
  });

  // Total
  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  const totalFOB = order.items.reduce((sum, i) => sum + Number(i.costFOB) * i.quantity, 0);
  const tX = W - margin - 60;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TOTAL FOB:", tX, finalY);
  doc.text(fmt(totalFOB, order.currency), W - margin, finalY, { align: "right" });

  let currentY = finalY;

  if (order.notes) {
    currentY += 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Notas", margin, currentY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(order.notes, W - margin * 2);
    doc.text(noteLines, margin, currentY + 5);
  }

  // Footer separator
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(margin, pageH - 30, W - margin, pageH - 30);

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(`${BRAND.name} - ${BRAND.tagline}`, margin, pageH - 24);
  doc.text(BRAND.websiteLabel, margin, pageH - 19);
  doc.text(BRAND.salesEmail, margin, pageH - 14);

  return doc;
}

export async function downloadPurchaseOrderPDF(order: PurchaseOrderPDFData) {
  const doc = await generatePurchaseOrderPDF(order);
  doc.save(`orden-compra-${order.number}.pdf`);
}
