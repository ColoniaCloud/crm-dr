import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/operator-logs");

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  link: string | null;
  createdAt: string;
};

async function ensureAuditTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS operator_audit_logs (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      userId VARCHAR(191) NOT NULL,
      action VARCHAR(64) NOT NULL,
      entityType VARCHAR(32) NOT NULL,
      entityId VARCHAR(191) NULL,
      description TEXT NOT NULL,
      link VARCHAR(255) NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_oaudit_userId (userId),
      CONSTRAINT fk_oaudit_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE RESTRICT
    )
  `;
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN" && session?.user?.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || undefined;

    await ensureAuditTable();

    const rows = userId
      ? await prisma.$queryRaw<AuditRow[]>`
          SELECT id, action, entityType, entityId, description, link, createdAt
          FROM operator_audit_logs
          WHERE userId = ${userId}
          ORDER BY createdAt DESC
          LIMIT 300
        `
      : await prisma.$queryRaw<AuditRow[]>`
          SELECT id, action, entityType, entityId, description, link, createdAt
          FROM operator_audit_logs
          ORDER BY createdAt DESC
          LIMIT 300
        `;

    return NextResponse.json(rows);
  } catch (error) {
    log.error({ err: error }, "Error fetching operator logs");
    return NextResponse.json({ error: "Error al cargar logs" }, { status: 500 });
  }
}
