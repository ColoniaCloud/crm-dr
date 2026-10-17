import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logOperatorAction } from "@/lib/notifications";
import { canManageTask, toTaskDTOs } from "@/lib/crm-tasks";

/**
 * Cerrar una tarea de contacto cargando cómo salió (decisión L6 de AGENTES.md).
 *
 * Además de marcar la tarea hecha, actualiza el lead —cómo y cuándo se lo
 * contactó, y el resultado— y deja la nota en su historial. "No contestó" no lo
 * marca como contactado: vuelve a la cola del Priorizador pasados unos días.
 */

const OUTCOME_TITLE = {
  INTERESTED: "Le interesó",
  NOT_INTERESTED: "No le interesó",
  NO_ANSWER: "No contestó",
  CALL_BACK: "Volver a llamar",
} as const;

const schema = z.object({
  method: z.enum(["PHONE", "WHATSAPP", "EMAIL", "IN_PERSON"]),
  outcome: z.enum(["INTERESTED", "NOT_INTERESTED", "NO_ANSWER", "CALL_BACK"]),
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const task = await prisma.crmTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Tarea inexistente" }, { status: 404 });
  if (!canManageTask(task, { userId: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  if (!task.contactId) return NextResponse.json({ error: "La tarea no tiene un contacto" }, { status: 400 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { method, outcome, followUpDate, note } = parsed.data;
  if (outcome === "CALL_BACK" && !followUpDate) {
    return NextResponse.json({ error: "Indicá cuándo volver a llamar" }, { status: 400 });
  }

  const contacto = await prisma.contact.findUnique({ where: { id: task.contactId }, select: { id: true } });
  if (!contacto) return NextResponse.json({ error: "El contacto ya no existe" }, { status: 404 });

  const ahora = new Date();
  const metodo = { PHONE: "teléfono", WHATSAPP: "WhatsApp", EMAIL: "email", IN_PERSON: "en persona" }[method];
  const [actualizada] = await prisma.$transaction([
    prisma.crmTask.update({ where: { id }, data: { done: true } }),
    prisma.contact.update({
      where: { id: task.contactId },
      data: {
        contacted: outcome !== "NO_ANSWER",
        contactMethod: method,
        contactDate: ahora,
        leadOutcome: outcome,
        leadOutcomeAt: ahora,
        nextFollowUpAt: outcome === "CALL_BACK" && followUpDate ? new Date(`${followUpDate}T09:00:00-03:00`) : null,
      },
    }),
    prisma.leadActivity.create({
      data: {
        contactId: task.contactId,
        userId: session.user.id,
        type: method === "PHONE" ? "CALL" : method === "EMAIL" ? "EMAIL_SENT" : method === "IN_PERSON" ? "VISIT" : "OTHER",
        title: `${OUTCOME_TITLE[outcome]} (por ${metodo})`,
        description: [
          note || null,
          outcome === "CALL_BACK" && followUpDate ? `Volver a llamar el ${followUpDate.split("-").reverse().join("/")}.` : null,
        ].filter(Boolean).join("\n") || null,
      },
    }),
  ]);

  await logOperatorAction({
    userId: session.user.id,
    action: "LEAD_CONTACT_RESULT",
    entityType: "Contact",
    entityId: task.contactId,
    description: `Cerró "${task.title}": ${OUTCOME_TITLE[outcome].toLowerCase()} (por ${metodo}).`,
    link: `/leads/${task.contactId}`,
  });

  const [dto] = await toTaskDTOs([actualizada]);
  return NextResponse.json(dto);
}
