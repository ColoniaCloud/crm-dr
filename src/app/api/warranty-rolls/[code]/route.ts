import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { getRollByCode } from "@/lib/warranty";

const log = createLogger("api/warranty-rolls/[code]");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { code } = await params;
    const roll = await getRollByCode(code);
    if (!roll) {
      return NextResponse.json({ error: "Código de rollo no encontrado" }, { status: 404 });
    }

    return NextResponse.json(roll);
  } catch (error) {
    log.error({ err: error }, "Error fetching warranty roll");
    return NextResponse.json({ error: "Error al buscar el código" }, { status: 500 });
  }
}
