import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { validateBody } from "@/lib/api-validation";
import { rejectPaymentDeclaration } from "@/lib/payment-declarations";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/payments/declarations/[id]/reject");

const rejectSchema = z.object({
  reason: z.string().trim().min(3, "Contá al menos brevemente por qué se rechaza"),
});

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

  const body = await request.json().catch(() => null);
  const validation = validateBody(rejectSchema, body);
  if (!validation.success) return validation.response;

  try {
    const { id } = await params;
    const result = await rejectPaymentDeclaration(id, session.user.id, validation.data.reason);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error rejecting payment declaration");
    return NextResponse.json({ error: "Error al rechazar el pago" }, { status: 500 });
  }
}
