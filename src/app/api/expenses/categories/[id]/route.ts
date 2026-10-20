import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/expenses/categories/[id]");

const schema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/** Renombrar o archivar. No hay DELETE: los gastos viejos siguen apuntando a su categoría. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  const { id } = await params;
  const parsed = validateBody(schema, await request.json().catch(() => null));
  if (!parsed.success) return parsed.response;

  try {
    const existing = await prisma.expenseCategory.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
    if (parsed.data.name) {
      const clash = await prisma.expenseCategory.findUnique({ where: { name: parsed.data.name } });
      if (clash && clash.id !== id) {
        return NextResponse.json({ error: "Ya existe una categoría con ese nombre" }, { status: 409 });
      }
    }
    const category = await prisma.expenseCategory.update({ where: { id }, data: parsed.data });
    return NextResponse.json(category);
  } catch (error) {
    log.error({ err: error }, "Error updating expense category");
    return NextResponse.json({ error: "No se pudo guardar la categoría" }, { status: 500 });
  }
}
