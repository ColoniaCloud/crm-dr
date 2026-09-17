import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { transporter, isSmtpConfigured, FROM } from "@/lib/mailer";
import { workshopLogoPath } from "@/lib/workshop-logo";
import { crmBaseUrl, renderCertificado, type DatosCertificado, type FirmaDelTaller } from "@/lib/mail-garantia";

const log = createLogger("lib/warranty-activation-email");

/**
 * Junta todo lo que el certificado de garantía necesita de una instalación:
 * la garantía en sí, el producto y su configuración, y con qué nombre y logo
 * firma el taller. Lo usan los dos envíos del certificado —el de la activación
 * y el del cierre de orden en Mi Taller—, que solo se diferencian en quién lo
 * dispara y qué botón lleva.
 *
 * `null` si la instalación no existe o todavía no tiene vencimiento (no está
 * activada): sin eso no hay certificado que mandar.
 */
export async function cargarDatosCertificado(
  installationId: string
): Promise<(DatosCertificado & { destinatario: string | null }) | null> {
  const inst = await prisma.warrantyInstallation.findUnique({
    where: { id: installationId },
    select: {
      installationCode: true,
      activationToken: true,
      clientName: true,
      clientEmail: true,
      assetType: true,
      assetDescription: true,
      plate: true,
      installedAt: true,
      activatedAt: true,
      expiresAt: true,
      installerName: true,
      roll: {
        select: {
          product: {
            select: {
              name: true,
              sku: true,
              factoryCode: true,
              category: true,
              warrantyConfig: { select: { installWarrantyMonths: true } },
            },
          },
          saleItem: { select: { sale: { select: { contactId: true } } } },
        },
      },
    },
  });
  if (!inst?.expiresAt) return null;

  const contactId = inst.roll.saleItem?.sale.contactId ?? null;
  const taller = await nombreYLogoDelTaller(contactId, inst.installerName);

  return {
    destinatario: inst.clientEmail,
    nombreCliente: inst.clientName,
    installationCode: inst.installationCode,
    activationToken: inst.activationToken,
    producto: inst.roll.product.name,
    sku: inst.roll.product.sku ?? inst.roll.product.factoryCode ?? null,
    categoria: inst.roll.product.category,
    assetType: inst.assetType,
    assetDescription: inst.assetDescription,
    plate: inst.plate,
    installedAt: inst.installedAt,
    activatedAt: inst.activatedAt,
    expiresAt: inst.expiresAt,
    meses: inst.roll.product.warrantyConfig?.installWarrantyMonths ?? 12,
    taller,
  };
}

/**
 * El certificado que recibe el usuario final **al activar** su garantía.
 *
 * Es distinto del que le manda el taller al terminar una orden
 * (`workshop-warranty.ts`): aquel llega sin que la persona haya hecho nada.
 * Este sale cuando ella completa sus datos en `/garantia/<token>` y aprieta
 * activar — es su comprobante, y es el que va a buscar el día que tenga un
 * problema. Por eso el botón grande es el de reclamos: sin él, la única forma
 * de reclamar es acordarse del código y de la contraseña, y a los dos años
 * nadie se acuerda.
 *
 * Nunca tira: si el mail no sale, la garantía ya quedó activada igual.
 */
export async function enviarMailDeActivacion(installationId: string): Promise<void> {
  try {
    const datos = await cargarDatosCertificado(installationId);
    if (!datos?.destinatario) return;
    if (!isSmtpConfigured()) {
      log.error({ installationId }, "SMTP not configured — no se manda el mail de activación");
      return;
    }

    const { subject, html } = renderCertificado(datos, "activacion");
    await transporter.sendMail({ from: FROM(), to: datos.destinatario, subject, html });
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
 *
 * El logo entra por URL y no embebido: los clientes de correo bloquean las
 * imágenes en data URI. Ver la nota en el endpoint público del logo.
 */
async function nombreYLogoDelTaller(
  contactId: string | null,
  installerName: string | null
): Promise<FirmaDelTaller> {
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
