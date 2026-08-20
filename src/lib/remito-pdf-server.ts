import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BRAND } from "@/lib/brand";

interface RemitoData {
  number: number;
  issuedAt: string;
  notes?: string | null;
  facturaInfo?: string | null;
  sale: {
    number: number;
    requiresFactura?: boolean;
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
    items: Array<{
      quantity: number;
      product: { name: string; category?: string };
    }>;
  };
}

/**
 * Server-side (Node) twin of downloadRemitoPDF from src/components/remito-pdf.tsx
 * — same drawing logic, but returns a Buffer instead of triggering a browser
 * download, so it can be attached directly to an outgoing email (used by
 * /api/mobile/v1/remitos/[saleId]/send). Keep both files' layout in sync by
 * hand if either one changes — jsPDF/autoTable calls aren't easily shared
 * between a "use client" component and a server-only module.
 */
export function buildRemitoPdfBuffer(remito: RemitoData): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const margin = 15;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(BRAND.name, margin, 13);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Sistema de Gestión", margin, 20);

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(`REMITO #${remito.number}`, W - margin, 13, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Venta #${remito.sale.number}`, W - margin, 20, { align: "right" });
  doc.text(new Date(remito.issuedAt).toLocaleDateString("es-AR"), W - margin, 26, { align: "right" });

  doc.setTextColor(0, 0, 0);

  let y = 42;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Cliente", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += 6;
  const contact = remito.sale.contact;
  const clientName = `${contact.firstName} ${contact.lastName}`;
  doc.text(clientName, margin, y);
  if (contact.company) { y += 5; doc.text(contact.company, margin, y); }
  if (contact.email) { y += 5; doc.text(contact.email, margin, y); }
  if (contact.phone) { y += 5; doc.text(contact.phone, margin, y); }
  if (contact.address) { y += 5; doc.text(contact.address, margin, y); }
  const cityState = [contact.city, contact.state].filter(Boolean).join(", ");
  if (cityState) { y += 5; doc.text(cityState, margin, y); }

  if (remito.facturaInfo) {
    try {
      const billing = JSON.parse(remito.facturaInfo);
      const bX = W / 2;
      let bY = 42;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Datos de Facturación", bX, bY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      if (billing.razonSocial) { bY += 6; doc.text(billing.razonSocial, bX, bY); }
      if (billing.rut) { bY += 5; doc.text(`RUT/CUIT: ${billing.rut}`, bX, bY); }
      if (billing.direccion) { bY += 5; doc.text(billing.direccion, bX, bY); }
      if (billing.condicionIva) { bY += 5; doc.text(`IVA: ${billing.condicionIva}`, bX, bY); }
    } catch { /* skip if invalid JSON */ }
  }

  y = Math.max(y, 75) + 10;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Producto", "Categoría", "Cant."]],
    body: remito.sale.items.map((item) => [
      item.product.name,
      item.product.category || "",
      item.quantity.toString(),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 250] },
  });

  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  if (remito.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Notas: ${remito.notes}`, margin, finalY);
  }

  const pageH = doc.internal.pageSize.getHeight();
  const sigY = pageH - 40;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Firma:___________________________", margin, sigY);
  doc.text("Aclaración:________________________", margin + 65, sigY);
  doc.text("Documento:___________________________________", margin, sigY + 10);

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, pageH - 18, W - margin, pageH - 18);
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(`Documento generado por ${BRAND.name}`, W / 2, pageH - 12, { align: "center" });

  return Buffer.from(doc.output("arraybuffer"));
}
