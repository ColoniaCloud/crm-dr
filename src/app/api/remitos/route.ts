import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/remitos");

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const role = session.user.role as string;
  if (role !== "ADMIN" && role !== "SUPERADMIN") return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
  try {
    const remitos = await prisma.remito.findMany({
      include: {
        sale: {
          select: {
            id: true,
            number: true,
            status: true,
            requiresFactura: true,
            contact: {
              select: { id: true, firstName: true, lastName: true, company: true, email: true, phone: true, address: true, city: true, state: true },
            },
            items: {
              include: {
                product: {
                  select: { id: true, name: true, category: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(remitos);
  } catch (error) {
    log.error({ err: error }, "Error fetching remitos");
    return NextResponse.json(
      { error: "Error fetching remitos" },
      { status: 500 }
    );
  }
}
