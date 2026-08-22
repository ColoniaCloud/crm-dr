import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLogger } from "@/lib/logger";

const log = createLogger("mail-attachments");

/**
 * Almacenamiento en disco de los adjuntos y del .eml original.
 *
 * Los bytes NO van a MySQL: la base tiene tope de 6GB y un par de meses de
 * adjuntos la llenan. En la base queda solo la metadata (`EmailAttachment`) y
 * un `storageKey` relativo que apunta acá.
 *
 * OJO CON EL DIRECTORIO: en producción la app corre bajo Passenger desde
 * `.../hbuilds/current/nodejs`, y ese árbol se reconstruye entero en cada
 * deploy. Guardar adjuntos ahí adentro significa perderlos con el próximo
 * build. Por eso el default cuelga del home del usuario
 * (`/home/u442660975/mail-attachments`), que sobrevive a los deploys, y se
 * puede mover con `MAIL_ATTACHMENT_DIR`.
 */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_EMAIL = 20;

/** Raíz absoluta del almacenamiento. Ver la nota de arriba sobre hbuilds. */
export function attachmentRoot(): string {
  const configured = process.env.MAIL_ATTACHMENT_DIR?.trim();
  return configured && configured.length > 0
    ? path.resolve(configured)
    : path.join(os.homedir(), "mail-attachments");
}

/**
 * Convierte un storageKey de la base en una ruta absoluta, verificando que no
 * se escape de la raíz. El storageKey lo escribimos nosotros, pero si algún día
 * llega desde afuera un `../../.env` esto lo corta.
 */
export function resolveStoragePath(storageKey: string): string {
  const root = attachmentRoot();
  const abs = path.resolve(root, storageKey);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`storageKey fuera de la raíz de adjuntos: ${storageKey}`);
  }
  return abs;
}

async function writeFile(storageKey: string, data: Buffer): Promise<void> {
  const abs = resolveStoragePath(storageKey);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
}

export interface StoredAttachment {
  storageKey: string;
  checksum: string;
  sizeBytes: number;
}

/**
 * Guarda un adjunto. El nombre en disco es el id de la fila, nunca el filename
 * del remitente — así un adjunto llamado `../../server.js` no puede hacer nada.
 * El filename original vive en la base y se usa solo al descargar.
 */
export async function storeAttachment(
  emailId: string,
  attachmentId: string,
  data: Buffer
): Promise<StoredAttachment> {
  const storageKey = path.posix.join(emailId, attachmentId);
  await writeFile(storageKey, data);
  return {
    storageKey,
    checksum: crypto.createHash("sha256").update(data).digest("hex"),
    sizeBytes: data.byteLength,
  };
}

/** Guarda el mensaje MIME crudo tal como llegó por IMAP. */
export async function storeRawMessage(emailId: string, source: Buffer): Promise<string> {
  const storageKey = path.posix.join(emailId, "original.eml");
  await writeFile(storageKey, source);
  return storageKey;
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveStoragePath(storageKey));
}

/** Borra el directorio completo de un mail. Tolera que ya no exista. */
export async function deleteEmailFiles(emailId: string): Promise<void> {
  try {
    await fs.rm(resolveStoragePath(emailId), { recursive: true, force: true });
  } catch (err) {
    log.warn({ err, emailId }, "No se pudieron borrar los archivos del email");
  }
}

/**
 * Decide qué adjuntos de un mail entran y cuáles se descartan, aplicando los
 * topes por archivo, por total y por cantidad.
 *
 * Devuelve los aceptados y el motivo de cada descarte. La política es
 * deliberadamente permisiva con el mail: un adjunto gigante hace que se pierda
 * ese adjunto, nunca el mensaje — si un mail fallara entero, el poller no
 * avanzaría el `imapLastUid` y trabaría toda la casilla.
 */
export function selectAttachmentsWithinLimits<T extends { filename: string; size: number }>(
  candidates: T[]
): { accepted: T[]; rejected: Array<{ item: T; reason: string }> } {
  const accepted: T[] = [];
  const rejected: Array<{ item: T; reason: string }> = [];
  let total = 0;

  for (const item of candidates) {
    if (accepted.length >= MAX_ATTACHMENTS_PER_EMAIL) {
      rejected.push({ item, reason: `supera los ${MAX_ATTACHMENTS_PER_EMAIL} adjuntos por mensaje` });
      continue;
    }
    if (item.size > MAX_ATTACHMENT_BYTES) {
      rejected.push({ item, reason: `pesa más de ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB` });
      continue;
    }
    if (total + item.size > MAX_TOTAL_ATTACHMENT_BYTES) {
      rejected.push({ item, reason: `el total del mensaje supera ${MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024}MB` });
      continue;
    }
    accepted.push(item);
    total += item.size;
  }

  return { accepted, rejected };
}

/**
 * Nombre de archivo seguro para la cabecera `Content-Disposition`.
 *
 * Devuelve las dos formas que pide la RFC 6266: un `filename` ASCII para
 * clientes viejos y un `filename*` en UTF-8 para los que soportan RFC 5987 —
 * sin esto, un adjunto llamado "Presupuesto Ñandú.pdf" se descarga con el
 * nombre roto. Las comillas y los saltos de línea se sacan porque permitirían
 * inyectar cabeceras.
 */
export function contentDispositionFilename(filename: string): string {
  const clean = filename.replace(/[\r\n"\\]/g, "").trim() || "adjunto";
  const ascii = clean.replace(/[^\x20-\x7E]/g, "_");
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

/**
 * Purga los archivos de adjuntos más viejos que `days`, dejando la fila en la
 * base con `purgedAt`. El mail sigue mostrando que tenía un adjunto y con qué
 * nombre — se pierde el archivo, no el registro de que existió.
 *
 * No está agendada todavía: la idea es colgarla del mismo cron que va a correr
 * el poller (paso 4) en vez de sumar otro `setInterval` al proceso web.
 */
export async function purgeAttachmentsOlderThan(
  prisma: { emailAttachment: {
    findMany: (a: unknown) => Promise<Array<{ id: string; storageKey: string | null }>>;
    update: (a: unknown) => Promise<unknown>;
  } },
  days: number
): Promise<{ purged: number; freedBytes: number }> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const stale = await prisma.emailAttachment.findMany({
    where: { createdAt: { lt: cutoff }, purgedAt: null, storageKey: { not: null } },
    select: { id: true, storageKey: true },
  });

  let freedBytes = 0;
  let purged = 0;

  for (const row of stale) {
    if (!row.storageKey) continue;
    try {
      const abs = resolveStoragePath(row.storageKey);
      const stat = await fs.stat(abs).catch(() => null);
      await fs.rm(abs, { force: true });
      if (stat) freedBytes += stat.size;
      await prisma.emailAttachment.update({
        where: { id: row.id },
        data: { storageKey: null, purgedAt: new Date() },
      });
      purged += 1;
    } catch (err) {
      log.warn({ err, attachmentId: row.id }, "No se pudo purgar un adjunto");
    }
  }

  return { purged, freedBytes };
}
