import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { serializeSaleDetail } from "@/lib/mobile-sale";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mobile/v1/sales/[id]");

const addNoteSchema = z.object({ note: z.string().min(1) });

export function OPTIONS() {
  return mobileCorsPreflight();
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  try {
    const { id } = await params;
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, company: true, cuit: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!sale) {
      return withMobileCors(NextResponse.json({ error: "Venta no encontrada" }, { status: 404 }));
    }

    return withMobileCors(NextResponse.json({ sale: serializeSaleDetail(sale) }));
  } catch (error) {
    log.error({ err: error }, "Error fetching sale detail");
    return withMobileCors(NextResponse.json({ error: "Error al buscar la venta" }, { status: 500 }));
  }
}

// Appends a timestamped note to the sale — used by the "Agregar nota" button
// on the sale detail screen.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  const json = await request.json().catch(() => null);
  const validation = validateBody(addNoteSchema, json);
  if (!validation.success) return withMobileCors(validation.response);

  try {
    const { id } = await params;
    const existing = await prisma.sale.findUnique({ where: { id }, select: { notes: true, number: true } });
    if (!existing) {
      return withMobileCors(NextResponse.json({ error: "Venta no encontrada" }, { status: 404 }));
    }

    const stamp = new Date().toLocaleString("es-AR");
    const entry = `[${stamp}] ${gate.user.name}: ${validation.data.note}`;
    const notes = existing.notes ? `${existing.notes}\n${entry}` : entry;

    const sale = await prisma.sale.update({ where: { id }, data: { notes }, select: { notes: true } });

    await logOperatorAction({
      userId: gate.user.sub,
      action: "SALE_NOTE_ADDED",
      entityType: "SALE",
      entityId: id,
      description: `Agregó una nota a la venta #${existing.number} (app móvil)`,
      link: "/sales",
    });

    return withMobileCors(NextResponse.json({ notes: sale.notes }));
  } catch (error) {
    log.error({ err: error }, "Error adding note to sale");
    return withMobileCors(NextResponse.json({ error: "Error al agregar la nota" }, { status: 500 }));
  }
}
