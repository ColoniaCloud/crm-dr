import QRCode from "qrcode";
import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeWhatsappNumber } from "@/lib/whatsapp";
import { ensureRemitoPublicToken, loadRemitoById, remitoPublicUrl } from "@/lib/remito-document";
import { buildRemitoPdfBuffer, remitoPdfFilename } from "@/lib/remito-pdf-server";
import { renderRemitoFirmado, renderRemitoParaFirmar } from "@/lib/mail-remito";
import { transporter, FROM } from "@/lib/mailer";

/**
 * Lo que necesita la pantalla del remito para mandárselo al cliente: el link,
 * el QR para que lo escanee ahí mismo, y el WhatsApp ya armado.
 *
 * WhatsApp va por `wa.me` (REMITOS-FIRMA.md, fase 3): lo abre quien vende, con
 * el mensaje escrito, desde su propio WhatsApp. Sin plantillas de Meta ni el
 * servicio de WhatsApp del CRM — que para un mensaje iniciado por la empresa
 * exigiría una plantilla aprobada.
 *
 * El QR se arma en el servidor (SVG) para no sumarle la librería al bundle de
 * cada pantalla del CRM.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export interface RemitoShareInfo {
  url: string;
  qrSvg: string;
  remitoNumber: number;
  signed: boolean;
  contact: { name: string; email: string | null; phone: string | null };
  /** Null si el contacto no tiene teléfono: la pantalla ofrece compartir igual. */
  whatsappUrl: string | null;
  /** El texto del mensaje, para compartir por cualquier otro medio. */
  message: string;
}

export function remitoShareMessage(o: { nombre: string | null; numero: number; url: string; firmado: boolean }): string {
  const hola = o.nombre ? `Hola ${o.nombre.split(" ")[0]}` : "Hola";
  return o.firmado
    ? `${hola}, te dejamos el remito N° ${o.numero} de Kristall Film, ya firmado: ${o.url}`
    : `${hola}, te dejamos el remito N° ${o.numero} de Kristall Film. Revisalo y firmalo acá cuando recibas el pedido: ${o.url}`;
}

/**
 * Un celular argentino de 10 dígitos nacionales, sacándole el "15" si vino
 * cargado a la vieja usanza (área de 2 a 4 dígitos + 15 + número). Null si no
 * tiene esa forma.
 */
function celularArgentino(nacional: string): string | null {
  if (nacional.length === 10) return nacional;
  if (nacional.length === 12) {
    for (const area of [2, 3, 4]) {
      if (nacional.slice(area, area + 2) === "15") return nacional.slice(0, area) + nacional.slice(area + 2);
    }
  }
  return null;
}

/**
 * El número en el formato que exige `wa.me`. Para Argentina eso es
 * `549 + área + número`, sin 0 ni 15: `011 15 5555-1234` → `5491155551234`.
 *
 * Más estricto que normalizeWhatsappNumber (lib/whatsapp.ts), que deja pasar
 * `54111555551234`: el servicio de WhatsApp lo tolera, pero `wa.me` abre un
 * chat con un número que no existe. Uruguay (598) y lo que no se reconoce
 * pasan por el normalizador general.
 */
export function waMeNumber(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("598")) return d;
  if (d.startsWith("549")) {
    const cel = celularArgentino(d.slice(3));
    return cel ? `549${cel}` : d;
  }
  const nacional = d.startsWith("54") ? d.slice(2) : d.startsWith("0") ? d.slice(1) : d;
  const cel = celularArgentino(nacional);
  return cel ? `549${cel}` : normalizeWhatsappNumber(raw);
}

export function whatsappLink(phone: string | null, message: string): string | null {
  const numero = phone ? waMeNumber(phone) : "";
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(message)}` : null;
}

export async function buildRemitoShareInfo(db: Db, remitoId: string): Promise<RemitoShareInfo> {
  const token = await ensureRemitoPublicToken(db, remitoId);
  const r = await db.remito.findUniqueOrThrow({
    where: { id: remitoId },
    select: {
      number: true,
      signedAt: true,
      sale: { select: { contact: { select: { firstName: true, lastName: true, company: true, email: true, phone: true } } } },
    },
  });
  const c = r.sale.contact;
  const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.company || "";
  const url = remitoPublicUrl(token);
  const message = remitoShareMessage({ nombre: `${c.firstName ?? ""}`.trim() || null, numero: r.number, url, firmado: !!r.signedAt });
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0A0A0A", light: "#FFFFFF" } });

  return {
    url,
    qrSvg,
    remitoNumber: r.number,
    signed: !!r.signedAt,
    contact: { name, email: c.email, phone: c.phone },
    whatsappUrl: whatsappLink(c.phone, message),
    message,
  };
}

/**
 * Manda el remito por mail. Sin firmar: el mail para firmar, con el PDF en
 * blanco. Firmado: la copia firmada. Tira si el SMTP falla: quien llama le
 * muestra el error a quien vende, que está esperando la respuesta.
 */
export async function sendRemitoEmail(db: Db, remitoId: string, to: string): Promise<void> {
  const token = await ensureRemitoPublicToken(db, remitoId);
  const r = await loadRemitoById(db, remitoId);
  if (!r) throw new Error("Remito no encontrado");
  const url = remitoPublicUrl(token);
  const { subject, html } = r.signature
    ? renderRemitoFirmado(r.document, r.signature, url)
    : renderRemitoParaFirmar(r.document, url);
  await transporter.sendMail({
    from: FROM(),
    to,
    subject,
    html,
    attachments: [
      {
        filename: remitoPdfFilename(r.document, !!r.signature),
        content: buildRemitoPdfBuffer(r.document, { signature: r.signature, signUrl: r.signature ? null : url }),
      },
    ],
  });
}
