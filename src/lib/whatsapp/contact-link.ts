import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { escapeHtml, notifyAdmins } from "@/lib/notifications";
import { peerKey, peerVariants } from "@/lib/whatsapp/peer";

const log = createLogger("lib/whatsapp/contact-link");

/**
 * A qué ficha del CRM corresponde un número de WhatsApp.
 *
 * Cuando alguien nos escribe y su número no está en el CRM, se crea una ficha
 * provisoria (un LEAD con `source = WHATSAPP`) para que la conversación tenga
 * a quién colgarse y el equipo la complete después. La ficha se reconoce, y se
 * puede filtrar, por ese `source`.
 *
 * Nada de acá tira: si no se puede resolver, el mensaje igual queda guardado
 * (sin ficha) y se vincula la próxima vez o con el script de vinculación.
 */

/** Tope de fichas nuevas por hora: que un número spammer no llene la tabla de leads. */
export const MAX_AUTO_CREATED_PER_HOUR = 30;

const HOUR_MS = 60 * 60 * 1000;

/** Cuántos dígitos finales se comparan al buscar por teléfono. */
const MATCH_DIGITS = 10;
/** Menos que esto no alcanza para identificar a nadie. */
const MIN_DIGITS = 8;

export type ResolveArgs = {
  /** El número tal como lo mandó Meta (`wa_id`, `from` o `to`). */
  waId: string;
  /** Nombre de perfil de WhatsApp, si vino. */
  profileName?: string | null;
  /**
   * Si puede crear una ficha provisoria. Solo los mensajes **entrantes** crean:
   * lo que escribimos nosotros (ecos del celular) solo se vincula a una ficha
   * que ya exista, porque no es alguien que nos buscó a nosotros.
   */
  allowCreate: boolean;
  /** Avisar al equipo cuando se crea una ficha (default: sí). El script de vinculación lo apaga. */
  notify?: boolean;
  /** No aplicar el tope por hora (solo para el script de vinculación, que corre a mano). */
  ignoreCap?: boolean;
};

/** Devuelve el id de la ficha, o `null` si no hay (o no se debe adivinar). */
export async function resolveContactForPeer(args: ResolveArgs): Promise<string | null> {
  try {
    return await resolve(args);
  } catch (err) {
    log.error({ err, waId: args.waId }, "No se pudo vincular el número de WhatsApp a una ficha");
    return null;
  }
}

async function resolve({ waId, profileName, allowCreate, notify = true, ignoreCap = false }: ResolveArgs): Promise<string | null> {
  const key = peerKey(waId);
  if (key.length < MIN_DIGITS) return null;

  // 1) ¿Ya lo resolvimos antes? El mismo número puede venir como 549… o 54…
  const cached = await prisma.whatsAppCloudContact.findFirst({
    where: { waId: { in: peerVariants(key) }, contactId: { not: null } },
    select: { contactId: true },
  });
  if (cached?.contactId) {
    const alive = await prisma.contact.findUnique({ where: { id: cached.contactId }, select: { id: true } });
    if (alive) return alive.id;
    // La ficha se borró: se vuelve a resolver desde cero.
    await prisma.whatsAppCloudContact.updateMany({
      where: { contactId: cached.contactId },
      data: { contactId: null },
    });
  }

  // 2) ¿Hay una ficha con ese teléfono?
  const matches = await findContactsByPhone(key);
  if (matches.length === 1) {
    await rememberLink(waId, matches[0], profileName);
    return matches[0];
  }
  if (matches.length > 1) {
    // Dos fichas con el mismo número (duplicado): no se adivina cuál es.
    log.warn({ waId, matches: matches.length }, "Varias fichas con el mismo teléfono; no se vincula");
    return null;
  }

  // 3) No hay: se crea una provisoria, si corresponde.
  if (!allowCreate) return null;
  return createPlaceholder(waId, key, profileName, { notify, ignoreCap });
}

// ─── Búsqueda por teléfono ───────────────────────────────────────────────────

/**
 * Fichas cuyo whatsapp, teléfono o teléfono E.164 terminan igual que el número.
 *
 * Se comparan los últimos 10 dígitos y no el texto completo porque los
 * teléfonos están cargados a mano ("11 6666-0000", "+54 9 11 6666 0000") y
 * porque Meta escribe a los móviles argentinos como 549… o como 54… según el
 * evento. Los últimos 10 (código de área + número) son lo único estable.
 *
 * `REGEXP_REPLACE` existe en MySQL 8 y en MariaDB 10.0.5+.
 */
export async function findContactsByPhone(key: string): Promise<string[]> {
  const n = Math.min(MATCH_DIGITS, key.length);
  const suffix = key.slice(-n);
  const len = Prisma.raw(String(n));
  const digits = (column: string) =>
    Prisma.sql`RIGHT(REGEXP_REPLACE(COALESCE(${Prisma.raw(column)}, ''), '[^0-9]', ''), ${len})`;

  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM contacts
    WHERE ${digits("whatsapp")} = ${suffix}
       OR ${digits("phone")} = ${suffix}
       OR ${digits("phoneE164")} = ${suffix}
    LIMIT 5
  `);
  return rows.map((r) => r.id);
}

// ─── Ficha provisoria ────────────────────────────────────────────────────────

async function createPlaceholder(
  waId: string,
  key: string,
  profileName: string | null | undefined,
  opts: { notify: boolean; ignoreCap: boolean }
): Promise<string | null> {
  if (!opts.ignoreCap) {
    const since = new Date(Date.now() - HOUR_MS);
    const recent = await prisma.contact.count({ where: { source: "WHATSAPP", createdAt: { gte: since } } });
    if (recent >= MAX_AUTO_CREATED_PER_HOUR) {
      log.warn({ waId, recent }, "Tope de fichas automáticas por hora alcanzado; el mensaje queda sin ficha");
      return null;
    }
  }

  const phone = `+${waId.replace(/\D/g, "")}`;
  const name = (profileName ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  const id = randomUUID();

  // La fila del perfil hace de candado: el que logra ponerle `contactId` gana, y
  // si dos mensajes del mismo número llegan juntos, el otro borra su ficha de más.
  await ensureProfileRow(waId, name);

  await prisma.contact.create({
    data: {
      id,
      type: "LEAD",
      source: "WHATSAPP",
      firstName: name || phone,
      lastName: "",
      phone,
      whatsapp: phone,
      phoneE164: phone,
      notes: `Creado automáticamente el ${new Date().toISOString().slice(0, 10)}: escribió por WhatsApp desde un número que no estaba en el CRM.`,
    },
  });

  const claimed = await prisma.whatsAppCloudContact.updateMany({
    where: { waId, contactId: null },
    data: { contactId: id },
  });

  if (claimed.count === 0) {
    await prisma.contact.delete({ where: { id } }).catch((err) => log.error({ err, id }, "No se pudo borrar la ficha repetida"));
    const winner = await prisma.whatsAppCloudContact.findUnique({ where: { waId }, select: { contactId: true } });
    return winner?.contactId ?? null;
  }

  log.info({ contactId: id, key }, "Ficha creada a partir de un mensaje de WhatsApp");
  if (!opts.notify) return id;
  await notifyAdmins({
    type: "WHATSAPP_NEW_CONTACT",
    title: "Nuevo contacto por WhatsApp",
    message: `Escribió <strong>${escapeHtml(name || phone)}</strong> (${escapeHtml(phone)}) y no estaba en el CRM. Se creó un lead para que lo completes.`,
    link: `/leads/${id}`,
  }).catch((err) => log.error({ err }, "No se pudo avisar de la ficha nueva"));

  return id;
}

/** Deja anotado a qué ficha corresponde el número, para no buscarla de nuevo. */
async function rememberLink(waId: string, contactId: string, profileName?: string | null): Promise<void> {
  await ensureProfileRow(waId, profileName ?? "");
  await prisma.whatsAppCloudContact.updateMany({ where: { waId }, data: { contactId } });
}

/**
 * Que exista la fila del perfil. Dos mensajes simultáneos del mismo número
 * pueden intentar crearla a la vez; el que pierde ya tiene lo que buscaba.
 */
async function ensureProfileRow(waId: string, name: string): Promise<void> {
  try {
    await prisma.whatsAppCloudContact.upsert({
      where: { waId },
      create: { waId, name: name || null },
      update: {},
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
}
