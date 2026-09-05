import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import {
  propertyTypeLabel,
  propertyGoalLabel,
  timeWindowLabel,
} from "@/lib/property-types";
import { escapeHtml } from "@/lib/notifications";
import { transporter, isSmtpConfigured, FROM } from "@/lib/mailer";
import { sendWhatsapp, isWhatsappConfigured } from "@/lib/whatsapp";
import { BRAND } from "@/lib/brand";
import { portalBaseUrl } from "@/lib/portal-tokens";

const log = createLogger("lib/booking-notify");

/**
 * Los avisos de un pedido de turno.
 *
 * **Nada de acá tira nunca.** El pedido ya está guardado cuando se llama a
 * estas funciones: un mail que no sale o un WhatsApp caído no pueden deshacerlo,
 * y hacer fallar el request dejaría al cliente creyendo que no pidió nada
 * cuando en realidad el turno está en la bandeja del taller. Mismo criterio que
 * `warranty-claim-notify.ts`.
 */

/**
 * Base del sitio público donde vive la página del taller.
 *
 * Es la única base nueva: la del portal ya la resuelve `portalBaseUrl()`
 * (`CLIENT_PORTAL_URL`), y duplicarla con otro nombre de variable garantiza que
 * un día apunten a lugares distintos.
 */
function sitioPublicoBase(): string {
  return (process.env.PUBLIC_SITE_URL || "https://polariz.ar").replace(/\/$/, "");
}

/** Sin hora: para las visitas de arquitectura, donde la hora no se pidio. */
function fechaCorta(d: Date): string {
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

function fechaLarga(d: Date): string {
  return d.toLocaleString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Le avisa al INSTALADOR que le entró un pedido, por mail y por WhatsApp.
 *
 * Los dos canales y no uno: el mail queda como registro y el WhatsApp es lo que
 * de verdad mira un taller en el día. Se mandan en paralelo y cada uno se cae
 * solo — que falle el WhatsApp no tiene que impedir el mail.
 */
export async function avisarPedidoAlInstalador(bookingId: string): Promise<void> {
  try {
    const b = await prisma.workshopBooking.findUnique({
      where: { id: bookingId },
      select: {
        serviceName: true,
        clientName: true,
        clientPhone: true,
        clientEmail: true,
        category: true,
        vehicleType: true,
        plate: true,
        propertyType: true,
        glassCount: true,
        approxM2: true,
        goal: true,
        siteAddress: true,
        timeWindow: true,
        notes: true,
        preferredAt: true,
        contactId: true,
        contact: { select: { email: true, phone: true } },
      },
    });
    if (!b) return;

    // En arquitectura la hora exacta no se pidio: se pidio una franja. Decirle
    // al taller "10:30" cuando el cliente marco "el jueves a la manana" seria
    // inventarle un compromiso que nadie asumio.
    const cuando =
      b.category === "ARCHITECTURAL" && b.timeWindow
        ? `${fechaCorta(b.preferredAt)}, ${timeWindowLabel(b.timeWindow)}`
        : fechaLarga(b.preferredAt);
    const linkBandeja = `${portalBaseUrl()}/cliente/taller/turnos`;

    const filas: [string, string][] = [
      ["Servicio", b.serviceName],
      ["Cuándo lo pidió", cuando],
      ["Cliente", b.clientName],
      ["Teléfono", b.clientPhone],
    ];
    if (b.clientEmail) filas.push(["Email", b.clientEmail]);

    // Cada rubro muestra lo suyo. Un pedido de arquitectura con una fila
    // "Patente: —" es peor que no tener la fila.
    if (b.category === "ARCHITECTURAL") {
      // La direccion va primero: sin ella el taller no puede decidir si va.
      if (b.siteAddress) filas.push(["Dirección", b.siteAddress]);
      const inmueble = propertyTypeLabel(b.propertyType);
      if (inmueble) filas.push(["Inmueble", inmueble]);
      if (b.glassCount !== null) filas.push(["Vidrios", String(b.glassCount)]);
      if (b.approxM2 !== null) filas.push(["Superficie", `${Number(b.approxM2)} m²`]);
      const objetivo = propertyGoalLabel(b.goal);
      if (objetivo) filas.push(["Busca", objetivo]);
    } else if (b.plate) {
      filas.push(["Patente", b.plate]);
    }
    if (b.notes) filas.push(["Comentario", b.notes]);

    await Promise.allSettled([
      // ── mail ────────────────────────────────────────────────────────────
      (async () => {
        if (!b.contact.email || !isSmtpConfigured()) return;
        await transporter.sendMail({
          from: FROM(),
          to: b.contact.email,
          subject: `Nuevo pedido de turno — ${b.clientName}`,
          html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f4f4f5;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:28px 24px;">
    <h1 style="margin:0 0 8px 0;font-size:20px;color:#111;">Te pidieron un turno</h1>
    <p style="margin:0 0 20px 0;color:#3f3f46;font-size:14px;">
      Todavía no está agendado: entra a tu panel y confirmalo o rechazalo.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
      ${filas
        .map(
          ([k, v], i) => `
      <tr>
        <td style="padding:8px 0;color:#71717a;width:38%;${i > 0 ? "border-top:1px solid #f4f4f5;" : ""}">${k}</td>
        <td style="padding:8px 0;color:#111;font-weight:600;${i > 0 ? "border-top:1px solid #f4f4f5;" : ""}">${escapeHtml(v)}</td>
      </tr>`
        )
        .join("")}
    </table>
    <p style="margin:24px 0 0 0;">
      <a href="${linkBandeja}" style="background:#0ea5e9;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;display:inline-block;">
        Ver el pedido
      </a>
    </p>
  </div>
  <p style="max-width:560px;margin:14px auto 0;text-align:center;color:#a1a1aa;font-size:11px;">
    Mensaje automático de ${escapeHtml(BRAND.name)} · No respondas este correo.
  </p>
</div>`,
        });
      })(),

      // ── whatsapp ────────────────────────────────────────────────────────
      (async () => {
        if (!b.contact.phone || !isWhatsappConfigured()) return;
        await sendWhatsapp({
          to: b.contact.phone,
          contactId: b.contactId,
          message:
            `*Nuevo pedido de turno*\n\n` +
            `${b.serviceName}\n` +
            `${cuando}\n\n` +
            `${b.clientName} — ${b.clientPhone}\n` +
            // La direccion es lo unico imprescindible de una visita, asi que va
            // tambien en el WhatsApp, que es lo que el taller mira de verdad.
            (b.category === "ARCHITECTURAL"
              ? b.siteAddress
                ? `Direccion: ${b.siteAddress}\n`
                : ""
              : b.plate
                ? `Patente: ${b.plate}\n`
                : "") +
            `\nConfirmalo desde tu panel:\n${linkBandeja}`,
        });
      })(),
    ]);
  } catch (err) {
    log.error({ err, bookingId }, "No se pudo avisar el pedido de turno al instalador");
  }
}

/** El acuse al CLIENTE, con el link para cancelar. Solo si dejó mail. */
export async function avisarPedidoAlCliente(bookingId: string): Promise<void> {
  try {
    const b = await prisma.workshopBooking.findUnique({
      where: { id: bookingId },
      select: {
        serviceName: true,
        clientEmail: true,
        clientName: true,
        preferredAt: true,
        cancelToken: true,
        contact: { select: { workshopSettings: { select: { workshopName: true, handle: true } } } },
      },
    });
    if (!b?.clientEmail || !isSmtpConfigured()) return;

    const taller = b.contact.workshopSettings?.workshopName ?? "el taller";
    const linkCancelar = `${sitioPublicoBase()}/turno/cancelar/${b.cancelToken}`;

    await transporter.sendMail({
      from: FROM(),
      to: b.clientEmail,
      subject: `Pedimos tu turno en ${taller}`,
      html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f4f4f5;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:28px 24px;">
    <h1 style="margin:0 0 8px 0;font-size:20px;color:#111;">Tu pedido llegó</h1>
    <p style="margin:0 0 18px 0;color:#3f3f46;font-size:15px;line-height:1.6;">
      Le avisamos a <strong>${escapeHtml(taller)}</strong> que querés
      <strong>${escapeHtml(b.serviceName)}</strong> el
      <strong>${escapeHtml(fechaLarga(b.preferredAt))}</strong>.
    </p>
    <p style="margin:0 0 18px 0;color:#3f3f46;font-size:15px;line-height:1.6;">
      Todavía no está confirmado: el taller te va a contactar para cerrarlo. Si
      no podés, avisá desde acá.
    </p>
    <p style="margin:0;">
      <a href="${linkCancelar}" style="color:#71717a;font-size:13px;">Cancelar mi pedido</a>
    </p>
  </div>
  <p style="max-width:560px;margin:14px auto 0;text-align:center;color:#a1a1aa;font-size:11px;">
    Mensaje automático de ${escapeHtml(BRAND.name)} · No respondas este correo.
  </p>
</div>`,
    });
  } catch (err) {
    log.error({ err, bookingId }, "No se pudo avisar el pedido de turno al cliente");
  }
}

/** Cuando el taller responde. `confirmado` false = rechazado. */
export async function avisarRespuestaAlCliente(
  bookingId: string,
  confirmado: boolean
): Promise<void> {
  try {
    const b = await prisma.workshopBooking.findUnique({
      where: { id: bookingId },
      select: {
        serviceName: true,
        clientEmail: true,
        preferredAt: true,
        workOrder: { select: { scheduledAt: true } },
        contact: {
          select: {
            phone: true,
            workshopSettings: { select: { workshopName: true, publicPhone: true, publicAddress: true } },
          },
        },
      },
    });
    if (!b?.clientEmail || !isSmtpConfigured()) return;

    const s = b.contact.workshopSettings;
    const taller = s?.workshopName ?? "El taller";
    // La fecha que vale es la de la orden: el taller pudo correrla al confirmar.
    const cuando = fechaLarga(b.workOrder?.scheduledAt ?? b.preferredAt);
    const telefono = s?.publicPhone ?? b.contact.phone;

    await transporter.sendMail({
      from: FROM(),
      to: b.clientEmail,
      subject: confirmado
        ? `Turno confirmado en ${taller}`
        : `${taller} no pudo tomar tu turno`,
      html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f4f4f5;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:28px 24px;">
    <h1 style="margin:0 0 12px 0;font-size:20px;color:#111;">
      ${confirmado ? "Tu turno está confirmado" : "No pudieron tomar tu turno"}
    </h1>
    ${
      confirmado
        ? `<p style="margin:0 0 8px 0;color:#3f3f46;font-size:15px;line-height:1.6;">
             <strong>${escapeHtml(b.serviceName)}</strong><br>
             ${escapeHtml(cuando)}
           </p>
           ${s?.publicAddress ? `<p style="margin:0 0 8px 0;color:#3f3f46;font-size:15px;">${escapeHtml(s.publicAddress)}</p>` : ""}`
        : `<p style="margin:0 0 8px 0;color:#3f3f46;font-size:15px;line-height:1.6;">
             ${escapeHtml(taller)} no pudo tomar el turno que pediste. Si querés,
             escribiles y buscan otro horario.
           </p>`
    }
    ${telefono ? `<p style="margin:16px 0 0 0;color:#3f3f46;font-size:15px;">Teléfono: <strong>${escapeHtml(telefono)}</strong></p>` : ""}
  </div>
  <p style="max-width:560px;margin:14px auto 0;text-align:center;color:#a1a1aa;font-size:11px;">
    Mensaje automático de ${escapeHtml(BRAND.name)} · No respondas este correo.
  </p>
</div>`,
    });
  } catch (err) {
    log.error({ err, bookingId }, "No se pudo avisar la respuesta al cliente");
  }
}
