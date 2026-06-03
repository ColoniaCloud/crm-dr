import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/admin/migrate-numbers");

export async function POST() {
  const session = await auth();
  if (!session?.user?.id || (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    // Get all leads ordered by creation date
    const leads = await prisma.contact.findMany({
      where: { type: "LEAD" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    // Get all clients ordered by creation date
    const clients = await prisma.contact.findMany({
      where: { type: "CLIENT" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    let updatedLeads = 0;
    let updatedClients = 0;

    // Assign sequential numbers to leads (1, 2, 3, ...)
    for (let i = 0; i < leads.length; i++) {
      await prisma.$executeRawUnsafe(
        `UPDATE contacts SET leadNumber = ? WHERE id = ?`,
        i + 1,
        leads[i].id
      );
      updatedLeads++;
    }

    // Assign sequential numbers to clients (continuing from max lead number)
    const offset = leads.length;
    for (let i = 0; i < clients.length; i++) {
      await prisma.$executeRawUnsafe(
        `UPDATE contacts SET leadNumber = ? WHERE id = ?`,
        offset + i + 1,
        clients[i].id
      );
      updatedClients++;
    }

    return NextResponse.json({
      ok: true,
      message: `Números asignados: ${updatedLeads} leads (1-${updatedLeads}), ${updatedClients} clientes (${offset + 1}-${offset + updatedClients})`,
      updatedLeads,
      updatedClients,
    });
  } catch (error) {
    log.error({ err: error }, "Error migrating numbers");
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Error al migrar números", details: detail }, { status: 500 });
  }
}
