import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { sanitizeEmailHtml, buildEmailFrameDocument } from "@/lib/mail-html";
import { readStoredFile } from "@/lib/mail-attachments";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mail/[id]");

/**
 * Tope de lo que se embebe como data: en el documento del iframe.
 *
 * Las imágenes incrustadas suelen ser logos y firmas de pocos KB. El tope evita
 * que un mail con una foto de 8MB incrustada infle el JSON del detalle — en
 * base64 crecería un tercio más y el navegador tendría que tragarlo entero
 * antes de mostrar nada.
 */
const MAX_INLINE_IMAGE_BYTES = 512 * 1024;
const MAX_TOTAL_INLINE_BYTES = 2 * 1024 * 1024;

const INLINE_IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp|bmp|x-icon|avif)$/i;

/**
 * Detalle de un email. El listado (`GET /api/mail`) devuelve solo metadata para
 * no arrastrar cuerpos enteros — algunos pasan los 170KB — así que el cuerpo se
 * pide recién al abrir el mail.
 *
 * Devuelve `frameDocument`: el documento completo listo para el `srcdoc` del
 * iframe sandbox. El sanitizado se hace acá, en el servidor, y nunca se manda
 * el `bodyHtml` crudo al navegador.
 *
 * `?images=1` re-sanitiza permitiendo imágenes remotas. Es una acción explícita
 * del operador ("Mostrar imágenes"), no el default, porque cargarlas le confirma
 * al remitente que el mail se abrió. Las imágenes incrustadas del propio mail
 * (`cid:`) no dependen de ese permiso: salen de nuestro disco.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;
  const { session } = gate;

  try {
    const { id } = await params;
    const allowRemoteImages = new URL(request.url).searchParams.get("images") === "1";

    const email = await prisma.email.findFirst({
      // El filtro por userId es el aislamiento entre operadores: cada uno ve
      // solo su propia casilla, sin importar el rol.
      where: { id, userId: session.user.id },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, company: true } },
        attachments: {
          select: {
            id: true,
            filename: true,
            contentType: true,
            sizeBytes: true,
            contentId: true,
            isInline: true,
            storageKey: true,
            purgedAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!email) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const { bodyHtml, attachments, ...rest } = email;

    const inlineImages = await buildInlineImageMap(attachments);
    const sanitized = bodyHtml
      ? sanitizeEmailHtml(bodyHtml, { allowRemoteImages, inlineImages })
      : null;

    return NextResponse.json({
      ...rest,
      hasHtml: Boolean(bodyHtml),
      frameDocument: sanitized
        ? buildEmailFrameDocument(sanitized.html, { allowRemoteImages })
        : null,
      blockedImages: sanitized?.blockedImages ?? 0,
      unresolvedInlineImages: sanitized?.unresolvedInlineImages ?? 0,
      remoteImagesAllowed: allowRemoteImages,
      // Las inline no se listan como adjuntos: ya se ven dentro del cuerpo y
      // repetirlas abajo como "archivo adjunto" confunde (son el logo de la
      // firma, no algo que el remitente quiso mandar).
      attachments: attachments
        .filter((a) => !a.isInline)
        .map(({ storageKey, purgedAt, ...a }) => ({
          ...a,
          available: Boolean(storageKey) && !purgedAt,
        })),
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching email detail");
    return NextResponse.json({ error: "Error al cargar el correo" }, { status: 500 });
  }
}

/**
 * Lee de disco las imágenes incrustadas y las devuelve como `cid -> data: URI`,
 * respetando los topes. Los archivos que no estén, no sean imagen o no entren
 * se omiten: el sanitizador los cuenta como `unresolvedInlineImages`.
 */
async function buildInlineImageMap(
  attachments: Array<{
    contentId: string | null;
    isInline: boolean;
    contentType: string;
    sizeBytes: number;
    storageKey: string | null;
    purgedAt: Date | null;
  }>
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  let total = 0;

  for (const a of attachments) {
    if (!a.contentId || !a.storageKey || a.purgedAt) continue;
    if (!INLINE_IMAGE_TYPES.test(a.contentType)) continue;
    if (a.sizeBytes > MAX_INLINE_IMAGE_BYTES) continue;
    if (total + a.sizeBytes > MAX_TOTAL_INLINE_BYTES) continue;

    try {
      const data = await readStoredFile(a.storageKey);
      map[a.contentId] = `data:${a.contentType};base64,${data.toString("base64")}`;
      total += a.sizeBytes;
    } catch (err) {
      log.warn({ err, contentId: a.contentId }, "No se pudo leer una imagen incrustada");
    }
  }

  return map;
}
