import { prisma } from "@/lib/prisma";
import { esDemo } from "@/lib/demo-context";
import { logOperatorAction } from "@/lib/notifications";

/**
 * Tareas internas del equipo (`CrmTask`). Las usan la API `/api/tasks`, el
 * panel del asistente y la herramienta `create_task` del asistente IA, así que
 * las reglas de quién puede ver o asignar viven acá y no en cada ruta.
 *
 * - Cada usuario ve y edita las suyas.
 * - ADMIN y SUPERADMIN además ven las del equipo, y pueden asignarle una tarea
 *   a otra persona (que recibe un aviso en la campanita).
 */

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

export interface TaskDTO {
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  priority: TaskPriority | null;
  userId: string | null;
  userName: string | null;
  assignedById: string | null;
  assignedByName: string | null;
  contactId: string | null;
  contactName: string | null;
  createdAt: string;
}

export function isAdminRole(role: string | undefined | null): boolean {
  return role === "ADMIN" || role === "SUPERADMIN";
}

function contactLabel(c: { firstName: string; lastName: string; company: string | null }): string {
  return c.company || `${c.firstName} ${c.lastName}`.trim();
}

type TaskRow = {
  id: string;
  title: string;
  done: boolean;
  dueDate: Date | null;
  priority: string | null;
  userId: string | null;
  assignedById: string | null;
  contactId: string | null;
  createdAt: Date;
};

/** Completa nombres de usuario y contacto (CrmTask no tiene relaciones declaradas). */
export async function toTaskDTOs(tasks: TaskRow[]): Promise<TaskDTO[]> {
  const userIds = [...new Set(tasks.flatMap((t) => [t.userId, t.assignedById]).filter((x): x is string => !!x))];
  const contactIds = [...new Set(tasks.map((t) => t.contactId).filter((x): x is string => !!x))];

  const [users, contacts] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [],
    contactIds.length
      ? prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, firstName: true, lastName: true, company: true },
        })
      : [],
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const contactName = new Map(contacts.map((c) => [c.id, contactLabel(c)]));

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    done: t.done,
    dueDate: t.dueDate?.toISOString() ?? null,
    priority: (t.priority as TaskPriority | null) ?? null,
    userId: t.userId,
    userName: t.userId ? userName.get(t.userId) ?? null : null,
    assignedById: t.assignedById,
    assignedByName: t.assignedById ? userName.get(t.assignedById) ?? null : null,
    contactId: t.contactId,
    contactName: t.contactId ? contactName.get(t.contactId) ?? null : null,
    createdAt: t.createdAt.toISOString(),
  }));
}

/** Puede ver/editar/borrar la tarea: su dueño, quien se la asignó, o un ADMIN+. */
export function canManageTask(
  task: { userId: string | null; assignedById: string | null },
  actor: { userId: string; role: string },
): boolean {
  if (isAdminRole(actor.role)) return true;
  return task.userId === actor.userId || task.assignedById === actor.userId;
}

export class TaskError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Crea una tarea. Si `assigneeId` es otra persona, exige ADMIN+ y le deja el
 * aviso en la campanita.
 */
export async function createTask(params: {
  actor: { userId: string; role: string; name?: string | null };
  title: string;
  dueDate?: Date | null;
  priority?: string | null;
  assigneeId?: string | null;
  contactId?: string | null;
  via?: "assistant";
}): Promise<TaskDTO> {
  const { actor } = params;
  const title = params.title.trim();
  if (!title) throw new TaskError("Título requerido");

  const priority = params.priority && ["LOW", "MEDIUM", "HIGH"].includes(params.priority) ? params.priority : null;
  const assigneeId = params.assigneeId || actor.userId;
  const assigningOther = assigneeId !== actor.userId;

  let assignee: { id: string; name: string } | null = null;
  if (assigningOther) {
    if (!isAdminRole(actor.role)) {
      throw new TaskError("Solo ADMIN y SUPERADMIN pueden asignarle tareas a otra persona", 403);
    }
    assignee = await prisma.user.findFirst({
      where: { id: assigneeId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!assignee) throw new TaskError("No encontré a esa persona del equipo", 404);
  }

  if (params.contactId) {
    const exists = await prisma.contact.count({ where: { id: params.contactId } });
    if (!exists) throw new TaskError("Contacto inexistente", 404);
  }

  const task = await prisma.crmTask.create({
    data: {
      title,
      dueDate: params.dueDate ?? null,
      priority,
      userId: assigneeId,
      assignedById: assigningOther ? actor.userId : null,
      contactId: params.contactId || null,
    },
  });

  const prefix = params.via === "assistant" ? "Asistente IA creó" : "Creó";
  await logOperatorAction({
    userId: actor.userId,
    action: "CREATE_TASK",
    entityType: "TASK",
    entityId: task.id,
    description: assignee
      ? `${prefix} tarea "${title}" asignada a ${assignee.name}`
      : `${prefix} tarea "${title}"`,
    link: "/assistant",
  });

  if (assignee && !esDemo()) {
    await prisma.notification.create({
      data: {
        userId: assignee.id,
        type: "TASK_ASSIGNED",
        title: "Nueva tarea asignada",
        message: `${actor.name || "Un administrador"} te asignó: "${title}"${
          task.dueDate ? ` para el ${task.dueDate.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}` : ""
        }`,
        link: "/assistant",
      },
    });
  }

  const [dto] = await toTaskDTOs([task]);
  return dto;
}
