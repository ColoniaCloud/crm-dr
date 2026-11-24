import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const log = createLogger("api/search");

/**
 * La búsqueda rápida del header (⌘K): fichas de cualquier tipo —lead, cliente,
 * revendedor o instalador— por nombre, empresa, email o teléfono. Así no hay que
 * saber de antemano en qué lista está alguien.
 *
 * Mismo alcance que las listas: cualquier usuario logueado ve las fichas.
 */
export async function GET(request: Request) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const digits = q.replace(/\D/g, "");
    const rows = await prisma.contact.findMany({
      where: {
        OR: [
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { company: { contains: q } },
          { email: { contains: q } },
          { phone: { contains: q } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits } }, { whatsapp: { contains: digits } }] : []),
        ],
      },
      select: { id: true, type: true, firstName: true, lastName: true, company: true, city: true, state: true },
      orderBy: { updatedAt: "desc" },
      take: 12,
    });

    return NextResponse.json({
      results: rows.map((c) => ({
        id: c.id,
        type: c.type,
        name: c.company || `${c.firstName} ${c.lastName}`.trim(),
        sub: [c.company ? `${c.firstName} ${c.lastName}`.trim() : null, c.city || c.state].filter(Boolean).join(" · "),
      })),
    });
  } catch (error) {
    log.error({ err: error }, "Error en la búsqueda global");
    return NextResponse.json({ error: "No se pudo buscar" }, { status: 500 });
  }
}
