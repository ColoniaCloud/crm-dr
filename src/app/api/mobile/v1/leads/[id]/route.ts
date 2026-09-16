import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mobile/v1/leads/[id]");

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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  try {
    const { id } = await params;
    const lead = await prisma.contact.findFirst({
      where: { id, type: "LEAD" },
      select: DETAIL_SELECT,
    });

    if (!lead) {
      return withMobileCors(NextResponse.json({ error: "Lead no encontrado" }, { status: 404 }));
    }

    return withMobileCors(NextResponse.json({ lead }));
  } catch (error) {
    log.error({ err: error }, "Error fetching lead");
    return withMobileCors(NextResponse.json({ error: "Error al cargar el lead" }, { status: 500 }));
  }
}
