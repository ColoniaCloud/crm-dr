import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { transporter, isSmtpConfigured, FROM } from "@/lib/mailer";
import { renderNovedadDeReclamo } from "@/lib/mail-garantia";
import type { WarrantyClaimStatus } from "@prisma/client";

const log = createLogger("lib/warranty-claim-notify");

/**
 * Avisar cuando cambia el estado de un reclamo de garantía.
 *
 * Antes no se avisaba a nadie: el operador cambiaba el estado, se guardaba la
 * fila, y ahí terminaba. La persona que reclamó —que ya tuvo un problema con un
 * producto— no tenía forma de enterarse de que alguien lo estaba mirando salvo
 * volver a preguntar. Es el peor momento para dejar a alguien sin respuesta.
 *
 * Se avisa a dos lados, porque son dos personas distintas con dos intereses
 * distintos:
 *
 *   - **El cliente final**, por mail: es el que está esperando.
 *   - **El instalador dueño del rollo**, con una notificación en su portal:
 *     puso la lámina y le van a preguntar a él primero.
 *
 * Nunca tira. Que un aviso falle no puede deshacer un cambio de estado que ya
 * se guardó — el reclamo avanzó igual, lo que falta es el aviso.
 */

const TEXTO: Record<WarrantyClaimStatus, { titulo: string; cuerpo: string } | null> = {
  // OPEN es el estado inicial: volver a él no es novedad para nadie.
  OPEN: null,
  IN_REVIEW: {
    titulo: "Estamos revisando tu reclamo",
    cuerpo:
      "Recibimos tu reclamo y ya lo estamos revisando. Te vamos a escribir apenas tengamos una respuesta.",
  },
  RESOLVED: {
    titulo: "Tu reclamo fue resuelto",
    cuerpo: "Dimos por resuelto tu reclamo.",
  },
  REJECTED: {
    titulo: "Novedades sobre tu reclamo",
    cuerpo:
      "Revisamos tu reclamo y no corresponde cubrirlo por garantía. Abajo está el motivo.",
  },
};

export async function notifyClaimStatusChanged(
  claimId: string,
  nuevoEstado: WarrantyClaimStatus
): Promise<void> {
  const texto = TEXTO[nuevoEstado];
  if (!texto) return;

  try {
    const claim = await prisma.warrantyClaim.findUnique({
      where: { id: claimId },
      select: {
        resolutionNotes: true,
        reporterName: true,
        reporterEmail: true,
        installation: {
          select: {
            installationCode: true,
            activationToken: true,
            installerName: true,
            clientEmail: true,
            clientName: true,
            roll: {
              select: {
                product: { select: { name: true } },
                saleItem: { select: { sale: { select: { contactId: true } } } },
              },
            },
          },
        },
      },
    });
    if (!claim) return;

    // ── El instalador dueño del rollo ────────────────────────────────────
    const contactId = claim.installation.roll.saleItem?.sale.contactId;
    if (contactId) {
      await prisma.portalNotification.create({
        data: {
          contactId,
          type: "WARRANTY_CLAIM_UPDATED",
          title: texto.titulo,
          message: `El reclamo de la garantía ${claim.installation.installationCode} pasó a ${ESTADO_LABEL[nuevoEstado]}.`,
          link: "/cliente/reclamos",
        },
      });
    }

    // ── El cliente final ─────────────────────────────────────────────────
    //
    // El mail del reclamo va primero: es la dirección que la persona escribió
    // al reclamar, y puede no ser la misma con la que se activó la garantía
    // (un familiar, otro mail, el del taller). Si no hay ninguna, no hay a
    // dónde escribir y se corta sin ruido.
    const destinatario = claim.reporterEmail || claim.installation.clientEmail;
    if (!destinatario || !isSmtpConfigured()) return;

    const { subject, html } = renderNovedadDeReclamo({
      nombre: claim.reporterName || claim.installation.clientName,
      installationCode: claim.installation.installationCode,
      activationToken: claim.installation.activationToken,
      producto: claim.installation.roll.product.name,
      nombreTaller: claim.installation.installerName?.trim() || "Instalador autorizado",
      etiquetaEstado: ESTADO_LABEL[nuevoEstado],
      titulo: texto.titulo,
      cuerpo: texto.cuerpo,
      nota: claim.resolutionNotes,
    });
    await transporter.sendMail({ from: FROM(), to: destinatario, subject, html });
  } catch (err) {
    // Se loguea y se sigue: el cambio de estado ya está guardado.
    log.error({ err, claimId, nuevoEstado }, "No se pudo avisar el cambio de estado del reclamo");
  }
}

const ESTADO_LABEL: Record<WarrantyClaimStatus, string> = {
  OPEN: "Abierto",
  IN_REVIEW: "En revisión",
  RESOLVED: "Resuelto",
  REJECTED: "Rechazado",
};
