import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { transporter, isSmtpConfigured, FROM } from "@/lib/mailer";
import { escapeHtml } from "@/lib/notifications";
import { crmBaseUrl } from "@/lib/mail-garantia";
import { BRAND } from "@/lib/brand";
import { formatCurrency } from "@/lib/utils";

const log = createLogger("lib/factura-notify");

/**
 * El recordatorio de facturación.
 *
 * El CRM ya no le suma el 21% a la venta que pide factura: el precio de lista
 * ya lo incluye, así que sumárselo aparte lo cobraba dos veces. El total que se
 * registra y se cobra es el mismo lleve factura o no. Eso deja un cabo suelto
 * —alguien tiene que emitirla— que antes marcaba el número inflado en la
 * pantalla y ahora no marca nadie. Este mail es ese aviso: sale al confirmarse
 * la venta, con los datos que hacen falta para facturarla.
 *
 * **Nunca tira.** La venta ya está confirmada y el stock ya se movió cuando se
 * llama a esto; un mail que no sale no puede deshacer nada de eso. Mismo
 * criterio que `warranty-claim-notify.ts` y `booking-notify.ts`.
 */

/**
 * A quién le llega. Es una persona concreta —la que factura—, no el grupo de
 * admins: si se le manda a todos, no es de nadie. La env var existe para el
 * día que esa persona cambie sin necesidad de un deploy.
 */
export function destinatarioDeFacturacion(): string {
  return process.env.FACTURA_NOTIFY_EMAIL?.trim() || "carlos@kristallfilm.com";
}

export interface DatosFacturaPendiente {
  numero: number;
  cliente: string;
  /** RUT/CUIT del contacto. Sin esto no se puede facturar, así que si falta se dice. */
  cuit: string | null;
  email: string | null;
  telefono: string | null;
  fecha: Date;
  items: { nombre: string; cantidad: number; total: number }[];
  subtotal: number;
  descuento: number;
  total: number;
  notas: string | null;
  saleId: string;
}

function fila(etiqueta: string, valor: string, fuerte = false): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:#6b7280;">${escapeHtml(etiqueta)}</td>
    <td align="right" style="padding:6px 0;font-size:13px;color:#111;${fuerte ? "font-weight:700;" : ""}">${escapeHtml(valor)}</td>
  </tr>`;
}

export function renderRecordatorioDeFactura(d: DatosFacturaPendiente): {
  subject: string;
  html: string;
} {
  const link = `${crmBaseUrl()}/sales/${d.saleId}`;
  // El IVA que ya viene adentro del total, no uno que se sume: sobre un precio
  // con IVA incluido la parte gravada es total / 1,21.
  const iva = Math.round((d.total - d.total / 1.21) * 100) / 100;
  const fecha = d.fecha.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // El punto rojo y la palabra FACTURAR van al principio a propósito: el asunto
  // se lee de un vistazo en la lista de la bandeja, sin abrir nada.
  const subject = `🔴 FACTURAR — Venta #${d.numero} · ${d.cliente}`;

  const items = d.items
    .map(
      (i) => `<tr>
        <td style="padding:6px 0;font-size:13px;color:#111;">${escapeHtml(i.nombre)}</td>
        <td align="center" style="padding:6px 8px;font-size:13px;color:#6b7280;">x${i.cantidad}</td>
        <td align="right" style="padding:6px 0;font-size:13px;color:#111;">${escapeHtml(formatCurrency(i.total))}</td>
      </tr>`
    )
    .join("");

  const cuit = d.cuit?.trim()
    ? fila("RUT / CUIT", d.cuit.trim())
    : `<tr>
        <td style="padding:6px 0;font-size:13px;color:#6b7280;">RUT / CUIT</td>
        <td align="right" style="padding:6px 0;font-size:13px;color:#b91c1c;font-weight:600;">Falta en la ficha del cliente</td>
      </tr>`;

  return {
    subject,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:540px;margin:0 auto;padding:24px;background:#f9fafb;">
        <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e5e7eb;">
          <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;">${BRAND.name}</p>
          <h2 style="color:#111;margin:0 0 20px 0;font-size:20px;">Hay una venta para facturar</h2>
          <p style="color:#444;margin:0 0 20px 0;">
            Se confirmó la venta <strong>#${d.numero}</strong> de
            <strong>${escapeHtml(d.cliente)}</strong>, que pidió factura.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb;margin-bottom:8px;">
            ${fila("Fecha", fecha)}
            ${cuit}
            ${d.email ? fila("Email", d.email) : ""}
            ${d.telefono ? fila("Teléfono", d.telefono) : ""}
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb;margin-top:12px;">
            ${items}
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb;margin-top:12px;">
            ${fila("Subtotal", formatCurrency(d.subtotal))}
            ${d.descuento > 0 ? fila("Descuento", `- ${formatCurrency(d.descuento)}`) : ""}
            ${fila("Total de la venta", formatCurrency(d.total), true)}
            ${fila("IVA (21%) incluido", formatCurrency(iva))}
          </table>

          <p style="color:#6b7280;font-size:12px;margin:12px 0 0 0;">
            El total de arriba es lo que se le cobró al cliente y ya incluye el
            IVA: la factura va por ese mismo importe, no por uno mayor.
          </p>

          ${d.notas?.trim() ? `<p style="color:#6b7280;font-size:13px;margin:16px 0 0 0;">Notas de la venta: ${escapeHtml(d.notas.trim())}</p>` : ""}

          <div style="margin-top:20px;">
            <a href="${link}" style="display:inline-block;padding:10px 20px;background:#18181b;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">Ver la venta en el CRM</a>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px;">
          Mensaje automático de ${BRAND.name} · No respondas este correo.
        </p>
      </div>
    `,
  };
}

/**
 * Manda el recordatorio de la venta `saleId`. Se llama **después del commit**,
 * nunca adentro de la transacción que confirma la venta.
 */
export async function avisarFacturaPendiente(saleId: string): Promise<void> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        number: true,
        createdAt: true,
        subtotal: true,
        discount: true,
        total: true,
        notes: true,
        requiresFactura: true,
        contact: {
          select: {
            firstName: true,
            lastName: true,
            company: true,
            cuit: true,
            email: true,
            phone: true,
          },
        },
        items: {
          select: { quantity: true, total: true, product: { select: { name: true } } },
        },
      },
    });
    // El chequeo va acá además de en quien llama: es la última puerta antes de
    // mandar, y cuesta una lectura que ya se hizo.
    if (!sale || !sale.requiresFactura) return;
    if (!isSmtpConfigured()) {
      log.error({ saleId }, "SMTP not configured — no sale el recordatorio de facturación");
      return;
    }

    const { subject, html } = renderRecordatorioDeFactura({
      numero: sale.number,
      cliente:
        sale.contact.company?.trim() ||
        `${sale.contact.firstName} ${sale.contact.lastName}`.trim(),
      cuit: sale.contact.cuit,
      email: sale.contact.email,
      telefono: sale.contact.phone,
      fecha: sale.createdAt,
      items: sale.items.map((i) => ({
        nombre: i.product.name,
        cantidad: i.quantity,
        total: Number(i.total),
      })),
      subtotal: Number(sale.subtotal),
      descuento: Number(sale.discount),
      total: Number(sale.total),
      notas: sale.notes,
      saleId: sale.id,
    });

    await transporter.sendMail({
      from: FROM(),
      to: destinatarioDeFacturacion(),
      subject,
      html,
    });
  } catch (err) {
    // Se loguea y se sigue: la venta ya está confirmada y el stock ya se movió.
    log.error({ err, saleId }, "No se pudo mandar el recordatorio de facturación");
  }
}
