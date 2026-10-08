import { escapeHtml } from "@/lib/notifications";
import { C, F, banda, cabecera, cuerpo, documento, espacio, fechaCorta, llamado, pie, saludo } from "@/lib/mail-garantia";
import type { RemitoDocument, RemitoSignature } from "@/lib/remito-document";

/**
 * El mail que recibe el cliente cuando su remito queda firmado, con el PDF
 * firmado adjunto. Misma familia visual que los mails de garantía: arma el
 * documento con sus piezas (src/lib/mail-garantia.ts).
 *
 * Función pura (datos → asunto + HTML), como las de garantía.
 */

const LEGAL =
  "Este correo se generó automáticamente al firmarse el remito. Si no reconocés esta entrega, respondé a ventas@kristallfilm.com.";

export function renderRemitoFirmado(
  d: RemitoDocument,
  firma: RemitoSignature,
  verUrl: string | null
): { subject: string; html: string } {
  const asunto = `Remito N° ${d.remito.number} firmado — Kristall Film`;
  const unidades = d.items.reduce((s, i) => s + i.quantity, 0);
  const lista = d.items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.hair};font-family:${F};font-size:13px;color:${C.ink};">${escapeHtml(i.name)}${
          i.rollCode ? `<div style="font-size:11px;color:${C.muted};padding-top:2px;">Rollo ${escapeHtml(i.rollCode)}</div>` : ""
        }</td><td align="right" style="padding:8px 0;border-bottom:1px solid ${C.hair};font-family:${F};font-size:13px;color:${C.ink};white-space:nowrap;">&times; ${i.quantity}</td></tr>`
    )
    .join("");
  const nombre = firma.name || d.contact.name || null;

  return {
    subject: asunto,
    html: documento({
      asunto,
      preheader: `Tu conformidad de recepción quedó registrada. Adjuntamos el remito firmado.`,
      contenido:
        cabecera("Remito &middot; Firmado") +
        banda({
          eyebrow: `Remito de entrega &middot; N° ${d.remito.number}`,
          titulo: "Recibimos tu conformidad",
          bajada: `Firmado el ${fechaCorta(new Date(firma.signedAt))}. Te adjuntamos el remito en PDF con la firma al pie.`,
        }) +
        cuerpo(
          saludo(nombre, `Estos son los productos que figuran en el remito (${unidades} ${unidades === 1 ? "unidad" : "unidades"}):`) +
            espacio(12) +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${lista}</table>` +
            `<div style="font-family:${F};font-size:12px;line-height:1.7;color:${C.muted};padding-top:16px;">Venta N° ${d.sale.number}</div>` +
            (verUrl
              ? espacio(20) +
                llamado({
                  texto: "Podés volver a ver o descargar el remito firmado cuando quieras.",
                  boton: { texto: "Ver el remito", href: verUrl },
                })
              : "")
        ) +
        pie(LEGAL),
    }),
  };
}

const LEGAL_PARA_FIRMAR =
  "Recibís este correo porque tenés una entrega de Kristall Film. Si no reconocés este pedido, respondé a ventas@kristallfilm.com.";

/**
 * El mail que manda quien vende ANTES de la firma: el remito en PDF y el botón
 * para firmarlo online. Firmar es confirmar que se recibió, así que el texto lo
 * dice: se firma cuando llega el pedido, no antes.
 */
export function renderRemitoParaFirmar(d: RemitoDocument, firmarUrl: string): { subject: string; html: string } {
  const asunto = `Tu remito N° ${d.remito.number} de Kristall Film`;
  const unidades = d.items.reduce((s, i) => s + i.quantity, 0);
  const lista = d.items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.hair};font-family:${F};font-size:13px;color:${C.ink};">${escapeHtml(i.name)}${
          i.rollCode ? `<div style="font-size:11px;color:${C.muted};padding-top:2px;">Rollo ${escapeHtml(i.rollCode)}</div>` : ""
        }</td><td align="right" style="padding:8px 0;border-bottom:1px solid ${C.hair};font-family:${F};font-size:13px;color:${C.ink};white-space:nowrap;">&times; ${i.quantity}</td></tr>`
    )
    .join("");

  return {
    subject: asunto,
    html: documento({
      asunto,
      preheader: "Revisá los productos y firmá el remito cuando recibas el pedido.",
      contenido:
        cabecera("Remito &middot; Para firmar") +
        banda({
          eyebrow: `Remito de entrega &middot; N° ${d.remito.number}`,
          titulo: "Tu remito de entrega",
          bajada: "Cuando recibas el pedido, revisá que esté todo y firmá el remito desde el celular. Te lo adjuntamos también en PDF.",
          boton: { texto: "Revisar y firmar", href: firmarUrl },
        }) +
        cuerpo(
          saludo(d.contact.name || null, `El remito detalla ${unidades} ${unidades === 1 ? "unidad" : "unidades"}:`) +
            espacio(12) +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${lista}</table>` +
            `<div style="font-family:${F};font-size:12px;line-height:1.7;color:${C.muted};padding-top:16px;">Venta N° ${d.sale.number}</div>` +
            espacio(20) +
            llamado({
              texto: "Firmar es confirmar que recibiste los productos. Te mandamos una copia firmada al terminar.",
              boton: { texto: "Revisar y firmar", href: firmarUrl },
            })
        ) +
        pie(LEGAL_PARA_FIRMAR),
    }),
  };
}
