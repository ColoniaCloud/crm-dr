import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/expenses/receipts/[receiptId]");

/** Devuelve el archivo del comprobante, para verlo en otra pestaña o descargarlo. */
export async function GET(_req: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  const { receiptId } = await params;
  try {
    const receipt = await prisma.expenseReceipt.findUnique({ where: { id: receiptId } });
    if (!receipt) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 });

    const body = Buffer.from(receipt.data, "base64");
    const safeName = receipt.fileName.replace(/[^\w.\- ]+/g, "_");
    return new NextResponse(body, {
      headers: {
        "Content-Type": receipt.mimeType,
        "Content-Length": String(body.length),
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching receipt");
    return NextResponse.json({ error: "No se pudo cargar el comprobante" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  const { receiptId } = await params;
  try {
    const existing = await prisma.expenseReceipt.findUnique({ where: { id: receiptId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 });
    await prisma.expenseReceipt.delete({ where: { id: receiptId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error deleting receipt");
    return NextResponse.json({ error: "No se pudo eliminar el comprobante" }, { status: 500 });
  }
}
