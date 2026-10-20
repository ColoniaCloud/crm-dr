import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/expenses";

const log = createLogger("api/expenses/categories");

/**
 * Categorías de gasto. La primera vez que alguien entra al módulo se crean las
 * sugeridas (DEFAULT_EXPENSE_CATEGORIES); de ahí en más son del SUPERADMIN.
 */
export async function GET() {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  try {
    if ((await prisma.expenseCategory.count()) === 0) {
      await prisma.expenseCategory.createMany({
        data: DEFAULT_EXPENSE_CATEGORIES.map((name, i) => ({ name, sortOrder: i })),
        skipDuplicates: true,
      });
    }
    const categories = await prisma.expenseCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { expenses: true } } },
    });
    return NextResponse.json(categories);
  } catch (error) {
    log.error({ err: error }, "Error listing expense categories");
    return NextResponse.json({ error: "No se pudieron cargar las categorías" }, { status: 500 });
  }
}

const schema = z.object({ name: z.string().trim().min(1, "El nombre es obligatorio").max(100) });

export async function POST(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  const parsed = validateBody(schema, await request.json().catch(() => null));
  if (!parsed.success) return parsed.response;

  try {
    const exists = await prisma.expenseCategory.findUnique({ where: { name: parsed.data.name } });
    if (exists) return NextResponse.json({ error: "Ya existe una categoría con ese nombre" }, { status: 409 });
    const last = await prisma.expenseCategory.aggregate({ _max: { sortOrder: true } });
    const category = await prisma.expenseCategory.create({
      data: { name: parsed.data.name, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error creating expense category");
    return NextResponse.json({ error: "No se pudo crear la categoría" }, { status: 500 });
  }
}
