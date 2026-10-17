import { prisma } from "@/lib/prisma";

/**
 * Subclientes de revendedores: un Cliente con `resellerId` apuntando a un
 * Revendedor (ver el comentario en `Contact.resellerId`, schema.prisma).
 *
 * Valida lo que llega del formulario antes de guardarlo:
 * - `undefined` → no se toca (el pedido no habla del revendedor).
 * - `null` / `""` → se desasigna: el cliente pasa a ser directo de Kristall.
 * - un id → tiene que ser un contacto RESELLER; si no, error.
 */
export async function resolveResellerId(
  raw: unknown
): Promise<{ ok: true; value: string | null | undefined } | { ok: false; error: string }> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "Revendedor inválido" };

  const reseller = await prisma.contact.findFirst({
    where: { id: raw, type: "RESELLER" },
    select: { id: true },
  });
  if (!reseller) return { ok: false, error: "El revendedor elegido no existe" };
  return { ok: true, value: reseller.id };
}

/** Lo que se muestra de un revendedor al lado de su subcliente. */
export const RESELLER_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  company: true,
} as const;
