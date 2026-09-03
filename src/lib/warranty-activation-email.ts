import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { escapeHtml } from "@/lib/notifications";
import { transporter, isSmtpConfigured, FROM } from "@/lib/mailer";
import { portalBaseUrl } from "@/lib/portal-tokens";
import { BRAND } from "@/lib/brand";
import { workshopLogoPath } from "@/lib/workshop-logo";

const log = createLogger("lib/warranty-activation-email");

/**
 * Base pública del propio CRM. Es de donde salen las imágenes del mail: el logo
 * de Kristall vive en `public/` de este proyecto y el del taller lo sirve un
 * endpoint de acá. `portalBaseUrl()` apunta a kristallfilm.com, que es otro
 * sitio — usarlo para una imagen del CRM da un 404 y un mail sin logos.
 */
function crmBaseUrl(): string {
  return (process.env.NEXTAUTH_URL || "https://kri.kristallfilm.com").replace(/\/$/, "");
}

/**
 * El mail que recibe el usuario final **al activar** su garantía.
 *
 * Es distinto del que le manda el taller al terminar una orden
 * (`workshop-warranty.ts`): aquel dice «te dejamos la garantía activada», y
 * sale del lado del instalador. Este sale cuando la persona completa sus datos
 * en `/garantia/<token>` y aprieta activar — es su comprobante, y es el que va
 * a buscar el día que tenga un problema.
 *
 * Por eso lleva el link de reclamos bien visible: sin él, la única forma de
 * reclamar es acordarse del código y de la contraseña, y a los dos años nadie
 * se acuerda.
 *
 * Va **firmado por los dos**: el logo de Kristall y el del taller. Kristall
 * respalda la garantía; el taller es a quien la persona le va a golpear la
 * puerta. Si el taller no cargó logo, va su nombre — nunca un hueco.
 *
 * Nunca tira: si el mail no sale, la garantía ya quedó activada igual.
 */
export async function enviarMailDeActivacion(installationId: string): Promise<void> {
  try {
    const inst = await prisma.warrantyInstallation.findUnique({
      where: { id: installationId },
      select: {
        installationCode: true,
        activationToken: true,
        clientName: true,
        clientEmail: true,
        expiresAt: true,
        activatedAt: true,
        installerName: true,
        roll: {
          select: {
            product: {
              select: { name: true, warrantyConfig: { select: { installWarrantyMonths: true } } },
            },
            saleItem: { select: { sale: { select: { contactId: true } } } },
          },
        },
      },
    });
    if (!inst?.clientEmail || !inst.expiresAt) return;
    if (!isSmtpConfigured()) {
      log.error({ installationId }, "SMTP not configured — no se manda el mail de activación");
      return;
    }

    const contactId = inst.roll.saleItem?.sale.contactId ?? null;
    const taller = await nombreYLogoDelTaller(contactId, inst.installerName);

    // Dos bases distintas, y confundirlas rompe el mail:
    //   - las IMÁGENES (el logo de Kristall y el del taller) las sirve el CRM
    //   - el LINK de reclamos vive en el portal público
    const crm = crmBaseUrl();
    const linkReclamos = `${portalBaseUrl()}/garantia/${encodeURIComponent(inst.activationToken)}/reclamo`;
    const meses = inst.roll.product.warrantyConfig?.installWarrantyMonths ?? 12;
    const vence = inst.expiresAt.toLocaleDateString("es-AR");

    const filas: [string, string][] = [
      ["Producto instalado", inst.roll.product.name],
      ["Taller instalador", taller.nombre],
      ["Código de garantía", inst.installationCode],
      ["Link para reclamos", `<a href="${linkReclamos}" style="color:#c62828;">Reportar un problema</a>`],
      ["Garantía válida por", `${meses} meses — hasta el ${escapeHtml(vence)}`],
    ];

    // El logo del taller entra por URL y no embebido: los clientes de correo
    // bloquean las imágenes en data URI. Ver la nota en el endpoint público.
    const logoTaller = taller.logoUrl
      ? `<img src="${taller.logoUrl}" alt="${escapeHtml(taller.nombre)}" style="max-height:44px;max-width:180px;display:block;">`
      : `<span style="font-size:15px;font-weight:600;color:#111;">${escapeHtml(taller.nombre)}</span>`;

    await transporter.sendMail({
      from: FROM(),
      to: inst.clientEmail,
      subject: `Garantía activada — ${inst.installationCode}`,
      html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f4f4f5;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:10px;overflow:hidden;">

    <!-- Cabecera: Kristall y el taller, uno al lado del otro -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #e4e4e7;">
      <tr>
        <td style="padding:20px 24px;vertical-align:middle;">
          <img src="${crm}${BRAND.emailLogo}" alt="${escapeHtml(BRAND.name)}" style="max-height:44px;display:block;">
        </td>
        <td style="padding:20px 24px;vertical-align:middle;text-align:right;border-left:1px solid #e4e4e7;">
          ${logoTaller}
        </td>
      </tr>
    </table>

    <div style="padding:28px 24px;">
      <h1 style="margin:0 0 14px 0;font-size:24px;line-height:1.2;color:#111;">Garantía activada</h1>

      <p style="margin:0 0 24px 0;color:#3f3f46;font-size:15px;line-height:1.6;">
        Tu garantía Kristall protege tu instalación contra defectos de fábrica y/o calidad,
        asegurando una vida útil en óptimas condiciones.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        ${filas
          .map(
            ([etiqueta, valor], i) => `
        <tr>
          <td style="padding:10px 0;color:#71717a;width:44%;${i > 0 ? "border-top:1px solid #f4f4f5;" : ""}">${etiqueta}</td>
          <td style="padding:10px 0;color:#111;font-weight:600;${i > 0 ? "border-top:1px solid #f4f4f5;" : ""}">${valor}</td>
        </tr>`
          )
          .join("")}
      </table>

      <p style="margin:24px 0 0 0;color:#71717a;font-size:13px;line-height:1.6;">
        Guardá este mail. El link de arriba es el que vas a necesitar si algún día tenés un problema
        con tu instalación.
      </p>
    </div>

    <div style="background:#fafafa;border-top:1px solid #e4e4e7;padding:20px 24px;">
      <p style="margin:0 0 6px 0;font-size:13px;font-weight:700;letter-spacing:.06em;color:#111;">
        ${escapeHtml(BRAND.name.toUpperCase())}
      </p>
      <p style="margin:0;color:#71717a;font-size:13px;line-height:1.7;">
        ${escapeHtml(BRAND.tagline)}<br>
        <a href="${BRAND.website}" style="color:#71717a;">${escapeHtml(BRAND.websiteLabel)}</a><br>
        <a href="mailto:${BRAND.salesEmail}" style="color:#71717a;">${escapeHtml(BRAND.salesEmail)}</a>
      </p>
    </div>
  </div>

  <p style="max-width:560px;margin:14px auto 0;text-align:center;color:#a1a1aa;font-size:11px;">
    Mensaje automático de ${escapeHtml(BRAND.name)} · No respondas este correo.
  </p>
</div>`,
    });
  } catch (err) {
    // La garantía ya está activada: un mail que no sale no puede deshacerla.
    log.error({ err, installationId }, "No se pudo mandar el mail de activación de garantía");
  }
}

/**
 * Con qué nombre y logo se firma la garantía.
 *
 * `installerName` de la instalación es lo que se guardó en el momento —lo llena
 * el flujo de Mi Taller— y manda sobre la config actual, porque la garantía
 * dice quién hizo ese trabajo, no cómo se llama el taller hoy. Si no hay, se
 * cae a la razón social del contacto.
 */
async function nombreYLogoDelTaller(
  contactId: string | null,
  installerName: string | null
): Promise<{ nombre: string; logoUrl: string | null }> {
  if (!contactId) {
    return { nombre: installerName?.trim() || "Instalador autorizado", logoUrl: null };
  }

  const [settings, contact] = await Promise.all([
    prisma.workshopSettings.findUnique({
      where: { contactId },
      select: { workshopName: true, logo: true, logoSlug: true },
    }),
    prisma.contact.findUnique({
      where: { id: contactId },
      select: { company: true, firstName: true, lastName: true },
    }),
  ]);

  const nombre =
    installerName?.trim() ||
    settings?.workshopName?.trim() ||
    contact?.company?.trim() ||
    `${contact?.firstName ?? ""} ${contact?.lastName ?? ""}`.trim() ||
    "Instalador autorizado";

  return {
    nombre,
    logoUrl:
      settings?.logo && settings.logoSlug
        ? `${crmBaseUrl()}${workshopLogoPath(settings.logoSlug)}`
        : null,
  };
}
