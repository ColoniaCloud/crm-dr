import { prisma } from "@/lib/prisma";
import { confirmSale } from "@/lib/sales";
import { notifyAdmins } from "@/lib/notifications";
import { avisarFacturaPendiente } from "@/lib/factura-notify";
import { transporter, FROM, isSmtpConfigured } from "@/lib/mailer";
import { createLogger } from "@/lib/logger";
import {
  buildLiveDocument, hashSignedRemito, remitoPublicUrl,
  type RemitoDocument, type RemitoSignature, type RemitoSignedVia,
} from "@/lib/remito-document";
import { buildRemitoPdfBuffer, remitoPdfFilename } from "@/lib/remito-pdf-server";
import { renderRemitoFirmado } from "@/lib/mail-remito";

const log = createLogger("remito-sign");

/**
 * Firmar un remito, venga de donde venga la firma.
 *
 * **Firmar es entregar** (decisión de REMITOS-FIRMA.md): la venta pasa a
 * DELIVERED en la misma transacción. Y si seguía PENDING, primero se confirma
 * —entregar mercadería implica haberla vendido—, así que sin stock no se firma.
 * Ese caso existía desde antes (venta #114, octubre 2026: firmada sin haber
 * descontado stock ni asignado rollo).
 *
 * Al firmar, el contenido del remito se congela en `snapshot` con su hash. El
 * snapshot se arma DESPUÉS de confirmar, para que lleve los códigos de rollo
 * que la confirmación acaba de asignar.
 */

/** Un rechazo que se le muestra tal cual a quien firma, con su status HTTP. */
export class FirmaRechazada extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface SignRemitoInput {
  remitoId: string;
  via: RemitoSignedVia;
  /** El operador que registra la firma (PAPER, POS). Null en la firma online. */
  actorUserId: string | null;
  name?: string | null;
  dni?: string | null;
  /** Data URL PNG del trazo. Obligatoria salvo en PAPER. */
  image?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface SignRemitoResult {
  remitoId: string;
  saleId: string;
  saleNumber: number;
  remitoNumber: number;
  publicToken: string | null;
  /** Si esta firma fue la que confirmó la venta (estaba PENDING). */
  confirmada: boolean;
  /** Productos con garantía que se quedaron sin rollo al confirmar. */
  sinRollo: string[];
  requiresFactura: boolean;
  contactEmail: string | null;
  document: RemitoDocument;
  signature: RemitoSignature;
}

// ─── Validación de lo que manda quien firma ──────────────────────────────

const PNG_PREFIX = "data:image/png;base64,";
/** Un trazo de 1000×400 en PNG pesa 10-60 KB. 600 KB de base64 sobra. */
const MAX_IMAGE_CHARS = 600_000;

function validateImage(image: string): void {
  if (!image.startsWith(PNG_PREFIX) || image.length > MAX_IMAGE_CHARS) {
    throw new FirmaRechazada("La firma no tiene un formato válido");
  }
  const buf = Buffer.from(image.slice(PNG_PREFIX.length), "base64");
  const isPng = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!isPng) throw new FirmaRechazada("La firma no tiene un formato válido");
}

function cleanName(v: string | null | undefined): string | null {
  const t = v?.replace(/\s+/g, " ").trim() ?? "";
  return t ? t.slice(0, 120) : null;
}

function cleanDni(v: string | null | undefined): string | null {
  const t = v?.replace(/[^\dA-Za-z.\-]/g, "").trim() ?? "";
  return t ? t.slice(0, 20) : null;
}

// ─── La firma ────────────────────────────────────────────────────────────

export async function signRemito(input: SignRemitoInput): Promise<SignRemitoResult> {
  const name = cleanName(input.name);
  const dni = cleanDni(input.dni);
  const image = input.image ?? null;

  if (input.via !== "PAPER") {
    if (!image) throw new FirmaRechazada("Falta la firma");
    if (!name || name.length < 3) throw new FirmaRechazada("Escribí nombre y apellido de quien firma");
  }
  if (image) validateImage(image);

  return prisma.$transaction(async (tx) => {
    // Todo se relee adentro: entre que se abrió la página y se firmó, alguien
    // pudo confirmar, anular o firmar la venta.
    const remito = await tx.remito.findUnique({
      where: { id: input.remitoId },
      include: { sale: { select: { id: true, number: true, status: true, userId: true, requiresFactura: true, contact: { select: { email: true } } } } },
    });
    if (!remito) throw new FirmaRechazada("Remito no encontrado", 404);
    if (remito.signedAt) throw new FirmaRechazada("Este remito ya fue firmado", 409);
    if (remito.sale.status === "CANCELLED") throw new FirmaRechazada("La venta fue anulada: el remito no se puede firmar");

    let sinRollo: string[] = [];
    const confirmada = remito.sale.status === "PENDING";
    if (confirmada) {
      const sufijo =
        input.via === "ONLINE" ? " (al firmar online el remito)" : input.via === "POS" ? " (al firmar el remito en el POS)" : " (al firmar el remito)";
      try {
        // Sin operador (firma online), el movimiento de stock queda a nombre de
        // quien hizo la venta.
        ({ sinRollo } = await confirmSale(tx, remito.saleId, input.actorUserId ?? remito.sale.userId, sufijo));
      } catch (err) {
        // confirmSale tira con un mensaje para el operador (stock insuficiente).
        // Al cliente no le sirve: no puede hacer nada con eso.
        throw new FirmaRechazada(
          input.via === "ONLINE"
            ? "No pudimos registrar la firma en este momento. Comunicate con Kristall Film."
            : err instanceof Error ? err.message : "No se pudo confirmar la venta"
        );
      }
    }

    const document = await buildLiveDocument(tx, remito.id);
    const signedAt = new Date();
    const firma: Omit<RemitoSignature, "hash"> = { via: input.via, signedAt: signedAt.toISOString(), name, dni, image };
    const hash = hashSignedRemito(document, firma);

    // `signedAt: null` en el where: dos firmas simultáneas no se pisan, la
    // segunda se entera de que llegó tarde.
    const { count } = await tx.remito.updateMany({
      where: { id: remito.id, signedAt: null },
      data: {
        signedAt,
        signedVia: input.via,
        signedByName: name,
        signedByDni: dni,
        signedByUserId: input.actorUserId,
        signatureImage: image,
        signedIp: input.ip?.slice(0, 64) ?? null,
        signedUserAgent: input.userAgent?.slice(0, 512) ?? null,
        snapshot: document as unknown as object,
        snapshotHash: hash,
      },
    });
    if (count !== 1) throw new FirmaRechazada("Este remito ya fue firmado", 409);

    await tx.sale.update({ where: { id: remito.saleId }, data: { status: "DELIVERED" } });

    return {
      remitoId: remito.id,
      saleId: remito.saleId,
      saleNumber: remito.sale.number,
      remitoNumber: remito.number,
      publicToken: remito.publicToken,
      confirmada,
      sinRollo,
      requiresFactura: remito.sale.requiresFactura,
      contactEmail: remito.sale.contact.email,
      document,
      signature: { ...firma, hash },
    };
  });
}

/**
 * Lo que va después del commit, y nunca tira: la firma ya quedó guardada, y un
 * SMTP caído no puede hacer que quien firmó vea un error.
 *
 * `emailTo`: a dónde mandar la copia firmada. Null = no se manda (la firma en
 * papel no la manda: el cliente ya tiene su copia en la mano).
 */
export async function afterRemitoSigned(r: SignRemitoResult, opts: { emailTo: string | null }): Promise<{ sentTo: string | null }> {
  try {
    if (r.confirmada && r.requiresFactura) await avisarFacturaPendiente(r.saleId);
    if (r.sinRollo.length > 0) {
      await notifyAdmins({
        type: "SALE_WITHOUT_ROLL",
        title: "Una venta quedó sin rollo de garantía",
        message:
          `La venta #${r.saleNumber} se confirmó al firmar el remito, pero no había rollos libres de: ` +
          `${r.sinRollo.join(", ")}. El Cliente no va a ver esos rollos en su panel. ` +
          `Revisá que el stock de garantías esté cargado.`,
        link: `/sales/${r.saleId}`,
        email: true,
      });
    }
    if (r.signature.via === "ONLINE") {
      await notifyAdmins({
        type: "REMITO_SIGNED",
        title: "El cliente firmó un remito",
        message: `${r.signature.name ?? "El cliente"} firmó online el remito #${r.remitoNumber} (venta #${r.saleNumber}). La venta quedó entregada.`,
        link: `/sales/${r.saleId}`,
      });
    }
  } catch (err) {
    log.error({ err, remitoId: r.remitoId }, "Avisos posteriores a la firma");
  }

  if (!opts.emailTo) return { sentTo: null };
  try {
    if (!isSmtpConfigured()) return { sentTo: null };
    const verUrl = r.publicToken ? remitoPublicUrl(r.publicToken) : null;
    const { subject, html } = renderRemitoFirmado(r.document, r.signature, verUrl);
    await transporter.sendMail({
      from: FROM(),
      to: opts.emailTo,
      subject,
      html,
      attachments: [{ filename: remitoPdfFilename(r.document, true), content: buildRemitoPdfBuffer(r.document, { signature: r.signature }) }],
    });
    return { sentTo: opts.emailTo };
  } catch (err) {
    log.error({ err, remitoId: r.remitoId }, "No se pudo mandar el remito firmado");
    return { sentTo: null };
  }
}
