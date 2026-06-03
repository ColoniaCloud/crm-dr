import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ensurePaymentAuditTable } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/sales/[id]/payment-audit");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Solo superadmin puede ver este historial" }, { status: 403 });
  }

  const { id: saleId } = await params;

  try {
    await ensurePaymentAuditTable();

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        saleId: string;
        paymentId: string | null;
        userId: string;
        userName: string;
        userEmail: string;
        action: string;
        oldValues: string | null;
        newValues: string | null;
        description: string;
        createdAt: Date;
      }>
    >`
      SELECT
        pal.id,
        pal.saleId,
        pal.paymentId,
        pal.userId,
        u.name AS userName,
        u.email AS userEmail,
        pal.action,
        pal.oldValues,
        pal.newValues,
        pal.description,
        pal.createdAt
      FROM payment_audit_logs pal
      INNER JOIN users u ON u.id = pal.userId
      WHERE pal.saleId = ${saleId}
      ORDER BY pal.createdAt DESC
    `;

    return NextResponse.json(rows);
  } catch (error) {
    log.error({ err: error }, "Error fetching payment audit logs");
    return NextResponse.json({ error: "Error al cargar historial" }, { status: 500 });
  }
}
