import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BRAND } from "@/lib/brand";
import { SIGNED_VIA_LABEL, type RemitoDocument, type RemitoSignature } from "@/lib/remito-document";

/**
 * El PDF del remito. Es el único generador: lo usan la descarga desde el CRM
 * (`/api/remitos/[id]/pdf`), la página pública (`/api/public/remitos/[token]/pdf`),
 * el envío desde el POS y el mail que sale al firmar.
 *
 * Antes había dos copias —una "use client" para descargar desde el navegador y
 * esta para adjuntar— que había que mantener iguales a mano. Ahora el
 * navegador pide el PDF al servidor y hay una sola.
 *
 * El diseño sigue a los mails de garantía (cabecera negra con el logo blanco,
 * paleta de src/lib/mail-garantia.ts). Sin precios: un remito es productos y
 * cantidades.
 */

type RGB = [number, number, number];
const BLACK: RGB = [10, 10, 10];
const TEXT: RGB = [92, 92, 92];
const MUTED: RGB = [122, 122, 119];
const HAIR: RGB = [228, 228, 226];
const BAND: RGB = [242, 242, 240];
const RED: RGB = [235, 52, 57];
const GOLD: RGB = [255, 218, 44];

const TZ = "America/Argentina/Buenos_Aires";
const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }).format(new Date(iso));
const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ,
  }).format(new Date(iso));

const CATEGORY_LABEL: Record<string, string> = {
  AUTOMOTIVE: "Automotriz",
  ARCHITECTURAL: "Arquitectura",
  PPF: "PPF",
};

/** El logo blanco de `public/`, leído una vez. Si no está, la cabecera lleva el nombre en texto. */
let logoCache: string | null | undefined;
function logoBlanco(): string | null {
  if (logoCache !== undefined) return logoCache;
  try {
    const buf = readFileSync(join(process.cwd(), "public", "logo-blanco.png"));
    logoCache = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

export interface RemitoPdfOptions {
  /** Firmado: la firma va al pie. Sin firmar: líneas para firmar a mano. */
  signature?: RemitoSignature | null;
  /** Sin firmar: el link para firmar online, impreso debajo de las líneas. */
  signUrl?: string | null;
}

export function buildRemitoPdfBuffer(d: RemitoDocument, opts: RemitoPdfOptions = {}): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;

  // ─── Cabecera negra ────────────────────────────────────────────────────
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, W, 40, "F");
  const logo = logoBlanco();
  if (logo) {
    // 1305×215 px: a 38 mm de ancho, 6,26 de alto. Comprimido: sin "MEDIUM"
    // jsPDF guarda los píxeles crudos y el PDF pesa un mega solo por el logo.
    doc.addImage(logo, "PNG", M, 12, 38, 38 * (215 / 1305), "logo", "MEDIUM");
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(BRAND.name, M, 17);
  }
  // Las tres barritas de la marca, como en los mails.
  const barY = 26;
  ([[74, 74, 74], RED, GOLD] as RGB[]).forEach((c, i) => {
    doc.setFillColor(...c);
    doc.rect(M + i * 6, barY, 5, 0.7, "F");
  });
  doc.setTextColor(160, 160, 160);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("REMITO DE ENTREGA", M + 20, barY + 0.8);

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(`Remito N° ${d.remito.number}`, W - M, 17, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(184, 184, 184);
  doc.text(`Venta N° ${d.sale.number}  ·  ${fecha(d.remito.issuedAt)}`, W - M, 24, { align: "right" });

  // ─── Cliente y facturación ─────────────────────────────────────────────
  let y = 52;
  const label = (t: string, x: number, yy: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(t.toUpperCase(), x, yy);
  };
  const line = (t: string, x: number, yy: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9.5);
    doc.setTextColor(...(bold ? BLACK : TEXT));
    doc.text(t, x, yy);
  };

  label("Entregado a", M, y);
  let cy = y + 6;
  const c = d.contact;
  line(c.name || c.company || "—", M, cy, true);
  if (c.company && c.company !== c.name) { cy += 5; line(c.company, M, cy); }
  if (c.cuit) { cy += 5; line(`CUIT ${c.cuit}`, M, cy); }
  if (c.address) { cy += 5; line(c.address, M, cy); }
  const cityState = [c.city, c.state].filter(Boolean).join(", ");
  if (cityState) { cy += 5; line(cityState, M, cy); }
  if (c.phone) { cy += 5; line(c.phone, M, cy); }
  if (c.email) { cy += 5; line(c.email, M, cy); }

  let by = y;
  if (d.facturaInfo) {
    const bx = W / 2 + 4;
    label("Datos de facturación", bx, by);
    by += 6;
    const f = d.facturaInfo;
    if (f.razonSocial) { line(f.razonSocial, bx, by, true); by += 5; }
    if (f.rut) { line(`CUIT ${f.rut}`, bx, by); by += 5; }
    if (f.direccion) { line(f.direccion, bx, by); by += 5; }
    if (f.condicionIva) { line(`IVA: ${f.condicionIva}`, bx, by); by += 5; }
  }

  y = Math.max(cy, by) + 10;

  // ─── Productos ─────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Producto", "Código", "Rollo", "Cant."]],
    body: d.items.map((i) => [
      i.category ? `${i.name}\n${CATEGORY_LABEL[i.category] ?? i.category}` : i.name,
      i.sku ?? "",
      i.rollCode ?? "",
      String(i.quantity),
    ]),
    styles: { fontSize: 9, textColor: BLACK, cellPadding: 3, lineColor: HAIR, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: BLACK, textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [250, 250, 249] },
    columnStyles: { 3: { halign: "right", cellWidth: 16 }, 2: { cellWidth: 42 }, 1: { cellWidth: 30 } },
  });
  let after = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  if (d.notes) {
    doc.setFillColor(...BAND);
    const notas = doc.splitTextToSize(d.notes, W - 2 * M - 10) as string[];
    const h = notas.length * 4.5 + 8;
    doc.rect(M, after, W - 2 * M, h, "F");
    doc.setFillColor(...BLACK);
    doc.rect(M, after, 1, h, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(notas, M + 6, after + 6);
    after += h + 6;
  }

  // ─── Firma ─────────────────────────────────────────────────────────────
  // Siempre al pie de la primera hoja si entra; si la tabla es larga, hoja nueva.
  const sigH = 50;
  let sy = H - 22 - sigH;
  if (after > sy) {
    doc.addPage();
    sy = 30;
  }
  doc.setDrawColor(...HAIR);
  doc.line(M, sy, W - M, sy);
  label("Conformidad de recepción", M, sy + 7);

  const s = opts.signature;
  if (s) {
    if (s.image) {
      try {
        // Caja de 70×28 mm; el trazo viene del canvas en proporción 5:2.
        doc.addImage(s.image, "PNG", M, sy + 10, 70, 28, "firma", "MEDIUM");
      } catch {
        /* una imagen corrupta no puede impedir el PDF: queda el resto de los datos */
      }
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(...TEXT);
      doc.text(doc.splitTextToSize("Firmado en papel. El original queda en poder de la empresa.", 68), M, sy + 22);
    }
    doc.setDrawColor(...BLACK);
    doc.line(M, sy + 39, M + 70, sy + 39);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...BLACK);
    doc.text([s.name, s.dni ? `DNI ${s.dni}` : null].filter(Boolean).join("  ·  ") || "Firma", M, sy + 44);

    const rx = M + 82;
    label("Datos de la firma", rx, sy + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT);
    doc.text(SIGNED_VIA_LABEL[s.via], rx, sy + 20);
    doc.text(`${fechaHora(s.signedAt)} (hora de Argentina)`, rx, sy + 25);
    if (s.hash) {
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text("Código de verificación", rx, sy + 31);
      doc.setFont("courier", "normal");
      doc.text(s.hash.slice(0, 32), rx, sy + 35);
      doc.text(s.hash.slice(32), rx, sy + 38.5);
    }
  } else {
    doc.setDrawColor(...BLACK);
    doc.line(M, sy + 30, M + 70, sy + 30);
    doc.line(M + 82, sy + 30, W - M, sy + 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Firma", M, sy + 35);
    doc.text("Aclaración y DNI", M + 82, sy + 35);
    if (opts.signUrl) {
      doc.setFontSize(8);
      doc.setTextColor(...TEXT);
      doc.text("También podés firmarlo online:", M, sy + 44);
      doc.setTextColor(...BLACK);
      doc.textWithLink(opts.signUrl, M + 44, sy + 44, { url: opts.signUrl });
    }
  }

  // ─── Pie ───────────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...HAIR);
    doc.line(M, H - 16, W - M, H - 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT);
    doc.text("KRISTALL®", M, H - 10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(`Tecnología alemana en láminas de alto rendimiento  ·  ${BRAND.salesEmail}  ·  ${BRAND.websiteLabel}`, M + 17, H - 10);
    if (pages > 1) doc.text(`${p}/${pages}`, W - M, H - 10, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}

export function remitoPdfFilename(d: RemitoDocument, signed: boolean): string {
  return `remito-${d.remito.number}${signed ? "-firmado" : ""}.pdf`;
}
