import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { validateBody } from "@/lib/api-validation";
import { logOperatorAction } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/mobile/v1/leads/[id]/activities");

const addNoteSchema = z.object({ note: z.string().min(1) });

const ACTIVITY_SELECT = {
  id: true,
  type: true,
  title: true,
  description: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
} as const;

export function OPTIONS() {
  return mobileCorsPreflight();
}

// El registro de notas de la ficha del lead: mismo LeadActivity que usa el
// CRM web, leído tal cual (incluye las STATUS_CHANGE de conversión, no solo
// las NOTE) para que el vendedor vea la misma historia. El alta desde acá es
// deliberadamente angosta — solo nota de texto, no el selector de tipo que
// tiene el CRM web.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  try {
    const { id } = await params;
    const activities = await prisma.leadActivity.findMany({
      where: { contactId: id },
      select: ACTIVITY_SELECT,
      orderBy: { createdAt: "desc" },
    });

    return withMobileCors(NextResponse.json({ activities }));
  } catch (error) {
    log.error({ err: error }, "Error fetching lead activities");
    return withMobileCors(NextResponse.json({ error: "Error al cargar las notas" }, { status: 500 }));
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireMobileAuth(request);
  if (!gate.success) return withMobileCors(gate.response);

  const json = await request.json().catch(() => null);
  const validation = validateBody(addNoteSchema, json);
  if (!validation.success) return withMobileCors(validation.response);

  try {
    const { id } = await params;
    const contact = await prisma.contact.findFirst({
      where: { id, type: "LEAD" },
      select: { id: true, firstName: true, lastName: true, company: true },
    });
    if (!contact) {
      return withMobileCors(NextResponse.json({ error: "Lead no encontrado" }, { status: 404 }));
    }

    const activity = await prisma.leadActivity.create({
      data: {
        contactId: id,
        userId: gate.user.sub,
        type: "NOTE",
        title: "Nota (POS móvil)",
        description: validation.data.note,
      },
      select: ACTIVITY_SELECT,
    });

    const contactName = contact.company || `${contact.firstName} ${contact.lastName}`.trim();
    await logOperatorAction({
      userId: gate.user.sub,
      action: "ADD_LEAD_ACTIVITY",
      entityType: "LEAD",
      entityId: id,
      description: `Agregó nota en "${contactName}" (app móvil)`,
      link: `/leads/${id}`,
    });

    return withMobileCors(NextResponse.json({ activity }, { status: 201 }));
  } catch (error) {
    log.error({ err: error }, "Error creating lead activity");
    return withMobileCors(NextResponse.json({ error: "Error al guardar la nota" }, { status: 500 }));
  }
}
