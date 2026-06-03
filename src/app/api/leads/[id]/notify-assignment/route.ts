import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendNotification } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/leads/[id]/notify-assignment");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { userIds } = await request.json();

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const lead = await prisma.contact.findUnique({
      where: { id },
      select: { firstName: true, lastName: true, company: true },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
    }

    const leadName = lead.company || `${lead.firstName} ${lead.lastName}`.trim();

    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, deletedAt: null },
      select: { id: true, name: true, email: true },
    });

    await Promise.all(
      users.map((u) =>
        sendNotification({
          userId: u.id,
          userEmail: u.email,
          userName: u.name,
          type: "LEAD_ASSIGNED",
          title: `Lead asignado: ${leadName}`,
          message: `<p style="color:#333;">El lead <strong>${leadName}</strong> fue asignado y está pendiente de seguimiento.</p>`,
          link: `/leads/${id}`,
          baseUrl: process.env.NEXTAUTH_URL,
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "Error notifying assignment");
    return NextResponse.json({ error: "Error al notificar asignación" }, { status: 500 });
  }
}
