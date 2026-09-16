import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mobile/v1/leads/[id]/convert");

const DETAIL_SELECT = {
  id: true,
  leadNumber: true,
  firstName: true,
  lastName: true,
  company: true,
  sector: true,
  email: true,
  phone: true,
  whatsapp: true,
  address: true,
  city: true,
  state: true,
  cuit: true,
  notes: true,
  contacted: true,
  createdAt: true,
  assignedTo: { select: { id: true, name: true } },
} as const;

export function OPTIONS() {
  return mobileCorsPreflight();
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  try {
    const { id } = await params;
    const lead = await prisma.contact.findFirst({
      where: { id, type: "LEAD" },
      select: { id: true, firstName: true, lastName: true, company: true },
    });
    if (!lead) {
      return withMobileCors(NextResponse.json({ error: "Lead no encontrado" }, { status: 404 }));
    }

    const contactName = lead.company || `${lead.firstName} ${lead.lastName}`.trim();

    await prisma.contact.update({ where: { id }, data: { type: "CLIENT" } });
    await prisma.leadActivity.create({
      data: {
        contactId: id,
        userId: gate.user.sub,
        type: "STATUS_CHANGE",
        title: "Convertido a Cliente",
        description: `${contactName} fue convertido de Lead a Cliente (POS móvil).`,
      },
    });

    await logOperatorAction({
      userId: gate.user.sub,
      action: "CONVERT_LEAD",
      entityType: "LEAD",
      entityId: id,
      description: `Convirtió lead "${contactName}" a Cliente (app móvil)`,
      link: `/clients/${id}`,
    });

    const client = await prisma.contact.findUniqueOrThrow({ where: { id }, select: DETAIL_SELECT });

    return withMobileCors(NextResponse.json({ lead: client }));
  } catch (error) {
    log.error({ err: error }, "Error converting lead to client");
    return withMobileCors(NextResponse.json({ error: "Error al convertir el lead" }, { status: 500 }));
  }
}
