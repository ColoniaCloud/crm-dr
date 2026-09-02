import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { escapeHtml } from "@/lib/notifications";
import { transporter, isSmtpConfigured, FROM } from "@/lib/mailer";
import { BRAND } from "@/lib/brand";
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

    const nombre = claim.reporterName || claim.installation.clientName || "";
    const nota = claim.resolutionNotes?.trim();

    await transporter.sendMail({
      from: FROM(),
      to: destinatario,
      subject: `${texto.titulo} — ${claim.installation.installationCode}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:540px;margin:0 auto;padding:24px;background:#f9fafb;">
          <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e5e7eb;">
            <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;">${BRAND.name}</p>
            <h2 style="color:#111;margin:0 0 20px 0;font-size:20px;">${escapeHtml(texto.titulo)}</h2>
            <p style="color:#444;margin:0 0 16px 0;">Hola ${escapeHtml(nombre)},</p>
            <p style="color:#444;margin:0 0 16px 0;">${escapeHtml(texto.cuerpo)}</p>
            ${
              nota
                ? `<div style="background:#f9fafb;border-left:3px solid #d1d5db;padding:12px 16px;margin:0 0 16px 0;">
                     <p style="margin:0;color:#444;white-space:pre-line;">${escapeHtml(nota)}</p>
                   </div>`
                : ""
            }
            <p style="color:#6b7280;font-size:13px;margin:0;">
              Garantía <strong>${escapeHtml(claim.installation.installationCode)}</strong> ·
              ${escapeHtml(claim.installation.roll.product.name)}
            </p>
          </div>
          <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px;">
            Mensaje automático de ${BRAND.name} · No respondas este correo.
          </p>
        </div>
      `,
    });
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
