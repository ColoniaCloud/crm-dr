"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface QuotePDFData {
  number: number;
  createdAt: string;
  contact: {
    firstName: string;
    lastName: string;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  };
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  tax?: number | string;
  requiresFactura?: boolean;
  notes?: string | null;
  items: Array<{
    product: { name: string; category?: string };
    quantity: number;
    unitPrice: number | string;
    total: number | string;
    discount?: number;
    discountType?: string;
  }>;
}

function fmt(n: number | string) {
  return `$${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

export async function generateQuotePDF(quote: QuotePDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const margin = 15;

  // Load logo
  try {
    const logoBase64 = await loadImageAsBase64("/logomail.png");
    doc.addImage(logoBase64, "PNG", margin, 10, 40, 15);
  } catch {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Dr Polarizados", margin, 20);
  }

  // Date top-right
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Generado el: ${new Date(quote.createdAt).toLocaleDateString("es-AR")}`, W - margin, 18, { align: "right" });
  doc.text(`Presupuesto #${quote.number}`, W - margin, 24, { align: "right" });

  // Horizontal line
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(margin, 32, W - margin, 32);

  // Client data block
  let y = 38;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Cliente", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const clientLabel = quote.contact.company || `${quote.contact.firstName ?? ""} ${quote.contact.lastName ?? ""}`.trim();
  if (clientLabel) { y += 5; doc.text(clientLabel, margin, y); }
  if (quote.contact.address) { y += 4; doc.text(quote.contact.address, margin, y); }
  const cityState = [quote.contact.city, quote.contact.state].filter(Boolean).join(", ");
  if (cityState) { y += 4; doc.text(cityState, margin, y); }
  if (quote.contact.email) { y += 4; doc.text(quote.contact.email, margin, y); }

  // Greeting
  y += 10;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");

  const contactName = `${quote.contact.firstName ?? ""} ${quote.contact.lastName ?? ""}`.trim();
  if (contactName) {
    doc.text(`Estimado ${contactName},`, margin, y);
  } else if (quote.contact.company) {
    doc.text(`Al equipo de ${quote.contact.company}`, margin, y);
  }

  y += 10;
  doc.setFontSize(10);
  const bodyText = "A continuación dejamos un detalle sobre el presupuesto solicitado/ofrecido de nuestros productos.\nAnte cualquier consulta no dude en contactarse por nuestros canales de atención al cliente.";
  const lines = doc.splitTextToSize(bodyText, W - margin * 2);
  doc.text(lines, margin, y);
  y += lines.length * 5 + 8;

  // Items table
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Producto", "Cantidad", "Precio/Uni", "Descuento", "Total"]],
    body: quote.items.map((item) => {
      const disc = item.discount ?? 0;
      let discLabel = "-";
      if (disc > 0) {
        discLabel = item.discountType === "PERCENT" ? `${disc}%` : fmt(disc);
      }
      return [
        item.product.name,
        item.quantity.toString(),
        fmt(item.unitPrice),
        discLabel,
        fmt(item.total),
      ];
    }),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 250] },
  });

  // Totals
  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  const tX = W - margin - 60;
  let currentY = finalY;

  if (quote.requiresFactura && Number(quote.tax || 0) > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Subtotal:", tX, currentY);
    doc.text(fmt(quote.subtotal), W - margin, currentY, { align: "right" });
    currentY += 6;
    doc.text("IVA (21%):", tX, currentY);
    doc.text(fmt(quote.tax!), W - margin, currentY, { align: "right" });
    currentY += 6;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TOTAL:", tX, currentY);
  doc.text(fmt(quote.total), W - margin, currentY, { align: "right" });

  // IVA disclaimer when no factura
  if (!quote.requiresFactura) {
    currentY += 10;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(150, 100, 0);
    doc.text("Los precios expresados en la lista no incluyen el IVA (21%).", margin, currentY);
    doc.setTextColor(0, 0, 0);
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
  doc.text("Dr Polarizados - Distribuidor oficial", margin, pageH - 24);
  doc.text("www.drpolarizados.com", margin, pageH - 19);
  doc.text("ventas@drpolarizados.com", margin, pageH - 14);

  return doc;
}

export async function downloadQuotePDF(quote: QuotePDFData) {
  const doc = await generateQuotePDF(quote);
  doc.save(`presupuesto-${quote.number}.pdf`);
}

export async function getQuotePDFBase64(quote: QuotePDFData): Promise<string> {
  const doc = await generateQuotePDF(quote);
  // Return raw base64 (without data URI prefix)
  const dataUri = doc.output("datauristring");
  return dataUri.split(",")[1];
}
