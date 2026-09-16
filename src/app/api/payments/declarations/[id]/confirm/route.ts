import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmPaymentDeclaration } from "@/lib/payment-declarations";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/payments/declarations/[id]/confirm");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const role = session.user.role as string;
  if (role !== "ADMIN" && role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const result = await confirmPaymentDeclaration(id, session.user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ paymentId: result.paymentId });
  } catch (error) {
    log.error({ err: error }, "Error confirming payment declaration");
    return NextResponse.json({ error: "Error al confirmar el pago" }, { status: 500 });
  }
}
