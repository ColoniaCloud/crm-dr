import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CLAIM_ISSUE_LABELS, CLAIM_ISSUE_TYPES, issueTypesPara, MAX_FOTOS_RECLAMO } from "@/lib/claim-issues";

/**
 * Lo que un reclamo dice además del texto libre: qué le pasó a la lámina,
 * cuántos paños (arquitectura) y fotos.
 *
 * Los cuatro caminos que crean reclamos —API pública (kristall-web), Portal de
 * Clientes, la página propia /garantia del CRM y el alta interna— pasan por
 * `crearReclamo`, así la regla del rubro vive en un solo lugar.
 *
 * **Solo servidor** (importa Prisma). Las etiquetas para pantallas están en
 * `claim-issues.ts`.
 */

/**
 * 900 KB de base64 por foto, el mismo tope que la foto de un pedido de turno:
 * el navegador la achica antes de mandarla, así que llegar acá significa que
 * algo no la achicó.
 */
const fotoSchema = z.object({
  data: z.string().min(1).max(900 * 1024, "La foto es muy pesada"),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

/** Validación de los campos nuevos. Todo opcional: los clientes viejos de la API siguen andando. */
export const datosReclamoSchema = z.object({
  issueType: z.enum(CLAIM_ISSUE_TYPES).nullish(),
  affectedPanes: z.coerce.number().int().positive().max(10_000).nullish(),
  photos: z.array(fotoSchema).max(MAX_FOTOS_RECLAMO, `Hasta ${MAX_FOTOS_RECLAMO} fotos`).nullish(),
});

export type DatosReclamo = z.infer<typeof datosReclamoSchema>;

export interface ReclamoBase {
  installationId: string;
  description: string;
  reporterName: string;
  reporterEmail: string;
  reporterPhone?: string | null;
  channel: string;
}

/**
 * Crea el reclamo con sus fotos. Quien llama ya resolvió la instalación y
 * verificó que se pueda reclamar; esto solo aplica la regla del rubro:
 *
 * - `ROTURA_VIDRIO` en una lámina que no es de arquitectura → 400. No se
 *   cambia en silencio por OTRO: quien la eligió estaba describiendo algo, y
 *   reclasificarlo escondería el error de la pantalla que la ofreció.
 * - `affectedPanes` fuera de arquitectura se descarta, como los datos de obra.
 */
export async function crearReclamo(
  base: ReclamoBase,
  datos: DatosReclamo | null | undefined
): Promise<{ ok: true; id: string; status: string } | { ok: false; error: string; status: number }> {
  const inst = await prisma.warrantyInstallation.findUnique({
    where: { id: base.installationId },
    select: { roll: { select: { product: { select: { category: true } } } } },
  });
  if (!inst) return { ok: false, error: "Garantía no encontrada", status: 404 };

  const categoria = inst.roll.product.category;
  const esArquitectura = categoria === "ARCHITECTURAL";
  const issueType = datos?.issueType ?? null;
  if (issueType && !issueTypesPara(categoria).includes(issueType)) {
    return { ok: false, error: "Ese tipo de problema no aplica a esta lámina", status: 400 };
  }

  const claim = await prisma.warrantyClaim.create({
    data: {
      installationId: base.installationId,
      description: base.description,
      reporterName: base.reporterName,
      reporterEmail: base.reporterEmail,
      reporterPhone: base.reporterPhone ?? null,
      channel: base.channel,
      issueType,
      affectedPanes: esArquitectura ? (datos?.affectedPanes ?? null) : null,
      photos: datos?.photos?.length
        ? { create: datos.photos.map((f) => ({ data: f.data, mimeType: f.mimeType })) }
        : undefined,
    },
    select: { id: true, status: true },
  });
  return { ok: true, id: claim.id, status: claim.status };
}

/** «Rotura del vidrio · 2 paños · 3 fotos» para el aviso a los admins. */
export function resumenReclamo(datos: DatosReclamo | null | undefined): string {
  const partes: string[] = [];
  if (datos?.issueType) partes.push(CLAIM_ISSUE_LABELS[datos.issueType]);
  if (datos?.affectedPanes) partes.push(`${datos.affectedPanes} ${datos.affectedPanes === 1 ? "paño" : "paños"}`);
  if (datos?.photos?.length) partes.push(`${datos.photos.length} ${datos.photos.length === 1 ? "foto" : "fotos"}`);
  return partes.join(" · ");
}

/** El mensaje del aviso con el resumen al final, si hay algo que resumir. */
export function conResumen(mensaje: string, datos: DatosReclamo | null | undefined): string {
  const r = resumenReclamo(datos);
  return r ? `${mensaje} — ${r}` : mensaje;
}
