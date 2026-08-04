import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { getClientAccount } from "@/lib/account";

const log = createLogger("api/clients/[id]/account");

/**
 * Estado de cuenta corriente de un cliente, para la ficha del CRM.
 *
 * Usa exactamente el mismo motor (`lib/account.ts`) que la API del portal, para
 * que el operador y el cliente nunca vean números distintos.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;

  try {
    const { id } = await params;
    const contact = await prisma.contact.findFirst({
      where: { id, type: "CLIENT" },
      select: { id: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    return NextResponse.json(await getClientAccount(id));
  } catch (error) {
    log.error({ err: error }, "Error fetching client account");
    return NextResponse.json({ error: "Error al cargar la cuenta corriente" }, { status: 500 });
  }
}
