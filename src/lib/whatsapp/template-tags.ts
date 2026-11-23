import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Las "etiquetas de WhatsApp" de una ficha: las plantillas que se le mandaron.
 *
 * No hay tabla: salen de los mensajes guardados (`whatsapp_cloud_messages`), igual
 * que «contactado» sale de los mensajes en `written-peers.ts`. Así no se pueden
 * desincronizar, incluyen lo que se mandó antes de que existiera esta pantalla, y
 * se agregan solas con cada envío —desde la bandeja, el envío masivo o un aviso
 * automático—, por cualquier línea.
 *
 * Cuenta un envío por plantilla cuando:
 *   - el mensaje es saliente y de tipo plantilla, con su nombre guardado;
 *   - quedó vinculado a la ficha (`contactId`), cosa que hace el CRM al mandar;
 *   - Meta no lo marcó como fallido: una plantilla que no llegó no "se le mandó".
 */

/** Saliente de plantilla que no falló. `status` puede ser null en filas viejas. */
const SENT_TEMPLATE: Prisma.WhatsAppCloudMessageWhereInput = {
  direction: "outbound",
  type: "template",
  templateName: { not: null },
  OR: [{ status: null }, { status: { not: "failed" } }],
};

export type ContactTemplateTag = {
  name: string;
  /** Cuántas veces se le mandó. */
  count: number;
  /** El envío más reciente, ISO. */
  lastSentAt: string;
};

/** Las plantillas que recibió una ficha, la más reciente primero. */
export async function templateTagsFor(contactId: string): Promise<ContactTemplateTag[]> {
  const rows = await prisma.whatsAppCloudMessage.groupBy({
    by: ["templateName"],
    where: { ...SENT_TEMPLATE, contactId },
    _count: { _all: true },
    _max: { timestamp: true },
    orderBy: { templateName: "asc" },
  });

  return rows
    .filter((r) => Boolean(r.templateName))
    .map((r) => ({
      name: r.templateName as string,
      count: r._count?._all ?? 0,
      lastSentAt: (r._max?.timestamp ?? new Date(0)).toISOString(),
    }))
    .sort((a, b) => b.lastSentAt.localeCompare(a.lastSentAt) || a.name.localeCompare(b.name));
}

/** Los nombres de todas las plantillas que se le mandaron a alguna ficha, para el filtro. */
export async function sentTemplateNames(): Promise<string[]> {
  const rows = await prisma.whatsAppCloudMessage.groupBy({
    by: ["templateName"],
    where: { ...SENT_TEMPLATE, contactId: { not: null } },
  });
  return rows
    .map((r) => r.templateName)
    .filter((n): n is string => Boolean(n))
    .sort((a, b) => a.localeCompare(b));
}

/** Las fichas que recibieron una plantilla. */
export async function contactIdsWithTemplate(name: string): Promise<string[]> {
  const rows = await prisma.whatsAppCloudMessage.groupBy({
    by: ["contactId"],
    where: { ...SENT_TEMPLATE, templateName: name, contactId: { not: null } },
  });
  return rows.map((r) => r.contactId).filter((id): id is string => Boolean(id));
}

export type TemplateFilterMode = "sent" | "not_sent";

/**
 * El filtro de Prisma para el listado: las fichas que recibieron la plantilla, o
 * las que no. Va en `where.id`, así se combina con el resto de los filtros y con
 * la paginación.
 */
export async function templateFilterWhere(
  name: string,
  mode: TemplateFilterMode
): Promise<{ id: { in: string[] } | { notIn: string[] } }> {
  const ids = await contactIdsWithTemplate(name);
  return mode === "sent" ? { id: { in: ids } } : { id: { notIn: ids } };
}
