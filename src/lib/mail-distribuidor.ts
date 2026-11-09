import { escapeHtml } from "@/lib/notifications";
import { banda, cabecera, cuerpo, documento, espacio, llamado, pie, saludo } from "@/lib/mail-garantia";
import { BRAND } from "@/lib/brand";

/**
 * El mail de la invitación personalizada a la página de distribuidores de Perú.
 * Mismo diseño que los de garantía y remito (cabecera negra, banda, pie): son
 * funciones puras, así que se puede ver con datos de ejemplo sin mandar nada.
 *
 * Trata de "usted", como la página y la plantilla de WhatsApp: es el registro
 * habitual en Perú. El texto es el mismo que aprobó Meta para la plantilla
 * `kristall_propuesta_distribuidor` (ver distributor-invite.ts).
 */

const LEGAL = `Recibe este correo porque Kristall Film le preparó una propuesta. Si no corresponde, responda a ${escapeHtml(BRAND.salesEmail)}.`;

export function renderInvitacionDistribuidor(d: {
  nombre: string;
  negocio: string;
  url: string;
}): { subject: string; html: string } {
  const asunto = `Propuesta del Programa Distribuidor Autorizado — ${d.negocio}`;
  return {
    subject: asunto,
    html: documento({
      asunto,
      preheader: `Preparamos una propuesta pensada para ${d.negocio}.`,
      contenido:
        cabecera("Distribuidor autorizado &middot; Perú") +
        banda({
          eyebrow: "Programa Distribuidor Autorizado",
          titulo: `Una propuesta pensada para ${escapeHtml(d.negocio)}`,
          bajada:
            "Láminas automotrices y de arquitectura, Garantía Digital en cada instalación y una suite digital para que su red venda más.",
          boton: { texto: "Ver propuesta", href: d.url },
        }) +
        cuerpo(
          saludo(
            d.nombre.split(/\s+/)[0] || null,
            `Le escribimos de Kristall Film. Preparamos una propuesta del Programa Distribuidor Autorizado pensada para <strong>${escapeHtml(d.negocio)}</strong>: el portafolio completo, cómo funciona el sistema en un video y los pasos para activar su red.`
          ) +
            espacio(18) +
            llamado({
              texto: "La propuesta es personal. Puede abrirla desde el celular o la computadora.",
              boton: { texto: "Ver propuesta", href: d.url },
              secundario: { texto: d.url, href: d.url },
            }) +
            espacio(18) +
            `<div style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#5C5C5C;">Carlos Arrúa &middot; Kristall</div>`
        ) +
        pie(LEGAL),
    }),
  };
}
