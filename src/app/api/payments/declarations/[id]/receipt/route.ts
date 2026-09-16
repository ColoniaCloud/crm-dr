import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/payments/declarations/[id]/receipt");

/** El comprobante que adjuntó el cliente al declarar el pago, para que el admin lo mire antes de confirmar. */
export async function GET(
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
    const d = await prisma.paymentDeclaration.findUnique({
      where: { id },
      select: { receipt: true, receiptMimeType: true },
    });
    if (!d?.receipt) return new NextResponse(null, { status: 404 });

    const bytes = Buffer.from(d.receipt, "base64");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": d.receiptMimeType ?? "application/octet-stream",
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    log.error({ err: error }, "Error serving payment declaration receipt");
    return new NextResponse(null, { status: 404 });
  }
}
