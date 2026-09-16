import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/payments/declarations");

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const role = session.user.role as string;
  if (role !== "ADMIN" && role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const declaraciones = await prisma.paymentDeclaration.findMany({
      where: status ? { status: status as "PENDING" | "CONFIRMED" | "REJECTED" } : undefined,
      include: {
        contact: { select: { firstName: true, lastName: true, company: true } },
        sale: { select: { number: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = declaraciones.map((d) => ({
      id: d.id,
      date: d.createdAt.toISOString(),
      clientName: d.contact.company || `${d.contact.firstName} ${d.contact.lastName}`.trim(),
      saleNumber: d.sale.number,
      amount: Number(d.amount),
      method: d.method,
      reference: d.reference,
      notes: d.notes,
      status: d.status,
      hasReceipt: d.receiptMimeType !== null,
      rejectionReason: d.rejectionReason,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    log.error({ err: error }, "Error fetching payment declarations");
    return NextResponse.json({ error: "Error fetching payment declarations" }, { status: 500 });
  }
}
