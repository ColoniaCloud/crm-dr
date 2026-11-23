import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { getRollsWhere, proyectarRollo } from "@/lib/warranty";

const log = createLogger("api/clients/[id]/warranty-rolls");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const rolls = await getRollsWhere({
      saleItem: { sale: { contactId: id } },
    });

    // La ficha del cliente la abre también un OPERATOR: sin token ni datos de
    // contacto del cliente final para él. Ver proyectarRollo().
    const esAdmin = session.user.role === "ADMIN" || session.user.role === "SUPERADMIN";
    return NextResponse.json({ rolls: rolls.map((r) => proyectarRollo(r, esAdmin)) });
  } catch (error) {
    log.error({ err: error }, "Error fetching warranty rolls");
    return NextResponse.json(
      { error: "Error al cargar garantías" },
      { status: 500 }
    );
  }
}
