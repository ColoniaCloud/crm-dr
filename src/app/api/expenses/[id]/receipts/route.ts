import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { MAX_RECEIPT_BYTES, RECEIPT_MIME_TYPES } from "@/lib/expenses";

const log = createLogger("api/expenses/[id]/receipts");

const schema = z.object({
  fileName: z.string().trim().min(1).max(191),
  mimeType: z.string().refine((m) => RECEIPT_MIME_TYPES.includes(m), "Solo imágenes (JPG, PNG, WEBP) o PDF"),
  /** Base64, con o sin el prefijo "data:…;base64,". */
  data: z.string().min(1),
});

/** Adjunta un comprobante (foto o PDF) a un gasto. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  const { id } = await params;
  const parsed = validateBody(schema, await request.json().catch(() => null));
  if (!parsed.success) return parsed.response;

  const data = parsed.data.data.replace(/^data:[^;]+;base64,/, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(data)) {
    return NextResponse.json({ error: "El archivo no llegó bien" }, { status: 400 });
  }
  const size = Math.floor((data.replace(/=+$/, "").length * 3) / 4);
  if (size > MAX_RECEIPT_BYTES) {
    return NextResponse.json({ error: "El comprobante no puede pesar más de 5 MB" }, { status: 400 });
  }

  try {
    const expense = await prisma.expense.findUnique({ where: { id }, select: { id: true } });
    if (!expense) return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });

    const receipt = await prisma.expenseReceipt.create({
      data: { expenseId: id, fileName: parsed.data.fileName, mimeType: parsed.data.mimeType, data, size },
      select: { id: true, fileName: true, mimeType: true, size: true },
    });
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error saving receipt");
    return NextResponse.json({ error: "No se pudo guardar el comprobante" }, { status: 500 });
  }
}
