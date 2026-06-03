import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logOperatorAction, notifyAdmins, escapeHtml } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/activities");

type ActivityRow = {
  id: string;
  contactMethod: string;
  responded: string | null;
  interestLevel: string;
  revealedSupplier: 0 | 1;
  supplierName: string | null;
  supplierPriceRange: string | null;
  needsQuote: 0 | 1;
  scheduleTask: 0 | 1;
  sendAfter: 0 | 1;
  notes: string | null;
  createdAt: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  contactId: string;
  firstName: string;
  lastName: string;
  company: string | null;
};

function isAdmin(role?: string) {
  return role === "ADMIN" || role === "SUPERADMIN";
}

async function ensureActivityTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      contactId VARCHAR(191) NOT NULL,
      userId VARCHAR(191) NOT NULL,
      contactMethod VARCHAR(32) NOT NULL,
      responded VARCHAR(16) NULL,
      interestLevel VARCHAR(16) NOT NULL,
      revealedSupplier BOOLEAN NOT NULL DEFAULT FALSE,
      supplierName TEXT NULL,
      supplierPriceRange TEXT NULL,
      needsQuote BOOLEAN NOT NULL DEFAULT FALSE,
      scheduleTask BOOLEAN NOT NULL DEFAULT FALSE,
      sendAfter BOOLEAN NOT NULL DEFAULT FALSE,
      notes LONGTEXT NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_activity_contactId (contactId),
      INDEX idx_activity_userId (userId),
      CONSTRAINT fk_activity_contact FOREIGN KEY (contactId) REFERENCES contacts(id) ON DELETE CASCADE,
      CONSTRAINT fk_activity_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE RESTRICT
    )
  `;
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!isAdmin(session?.user?.role)) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || undefined;

    await ensureActivityTable();

    const rows = userId
      ? await prisma.$queryRaw<ActivityRow[]>`
          SELECT
            a.id,
            a.contactMethod,
            a.responded,
            a.interestLevel,
            a.revealedSupplier,
            a.supplierName,
            a.supplierPriceRange,
            a.needsQuote,
            a.scheduleTask,
            a.sendAfter,
            a.notes,
            a.createdAt,
            u.id AS userId,
            u.name AS userName,
            u.email AS userEmail,
            u.role AS userRole,
            c.id AS contactId,
            c.firstName,
            c.lastName,
            c.company
          FROM activity_logs a
          INNER JOIN users u ON a.userId = u.id
          INNER JOIN contacts c ON a.contactId = c.id
          WHERE a.userId = ${userId}
          ORDER BY a.createdAt DESC
          LIMIT 300
        `
      : await prisma.$queryRaw<ActivityRow[]>`
          SELECT
            a.id,
            a.contactMethod,
            a.responded,
            a.interestLevel,
            a.revealedSupplier,
            a.supplierName,
            a.supplierPriceRange,
            a.needsQuote,
            a.scheduleTask,
            a.sendAfter,
            a.notes,
            a.createdAt,
            u.id AS userId,
            u.name AS userName,
            u.email AS userEmail,
            u.role AS userRole,
            c.id AS contactId,
            c.firstName,
            c.lastName,
            c.company
          FROM activity_logs a
          INNER JOIN users u ON a.userId = u.id
          INNER JOIN contacts c ON a.contactId = c.id
          ORDER BY a.createdAt DESC
          LIMIT 300
        `;

    const activities = rows.map((r) => ({
      id: r.id,
      contactMethod: r.contactMethod,
      responded: r.responded,
      interestLevel: r.interestLevel,
      revealedSupplier: !!r.revealedSupplier,
      supplierName: r.supplierName,
      supplierPriceRange: r.supplierPriceRange,
      needsQuote: !!r.needsQuote,
      scheduleTask: !!r.scheduleTask,
      sendAfter: !!r.sendAfter,
      notes: r.notes,
      createdAt: r.createdAt,
      user: {
        id: r.userId,
        name: r.userName,
        email: r.userEmail,
        role: r.userRole,
      },
      contact: {
        id: r.contactId,
        firstName: r.firstName,
        lastName: r.lastName,
        company: r.company,
      },
    }));

    return NextResponse.json(activities);
  } catch (error) {
    log.error({ err: error }, "Error fetching activities");
    return NextResponse.json({ error: "Error al cargar actividades" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.contactId || !body.contactMethod || !body.interestLevel) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    if (
      (body.contactMethod === "WHATSAPP" || body.contactMethod === "EMAIL") &&
      !body.responded
    ) {
      return NextResponse.json(
        { error: "Debe indicar si respondió para Email o WhatsApp" },
        { status: 400 }
      );
    }

    await ensureActivityTable();

    const activityId = crypto.randomUUID();

    await prisma.$executeRaw`
      INSERT INTO activity_logs (
        id, contactId, userId, contactMethod, responded, interestLevel,
        revealedSupplier, supplierName, supplierPriceRange,
        needsQuote, scheduleTask, sendAfter, notes
      ) VALUES (
        ${activityId},
        ${body.contactId},
        ${session.user.id},
        ${body.contactMethod},
        ${body.contactMethod === "WHATSAPP" || body.contactMethod === "EMAIL" ? body.responded : null},
        ${body.interestLevel},
        ${!!body.revealedSupplier},
        ${body.revealedSupplier ? body.supplierName || null : null},
        ${body.revealedSupplier ? body.supplierPriceRange || null : null},
        ${!!body.needsQuote},
        ${!!body.scheduleTask},
        ${!!body.sendAfter},
        ${body.notes || null}
      )
    `;

    const contact = await prisma.contact.findUnique({
      where: { id: body.contactId },
      select: { firstName: true, lastName: true, company: true },
    });

    await prisma.contact.update({
      where: { id: body.contactId },
      data: {
        contacted: true,
        contactMethod: body.contactMethod,
        contactDate: new Date(),
        currentSupplier: body.revealedSupplier ? body.supplierName || null : undefined,
        currentSupplierPrices: body.revealedSupplier ? body.supplierPriceRange || null : undefined,
        notes: body.notes ? body.notes : undefined,
      },
    });

    if (body.needsQuote && body.scheduleTask) {
      await prisma.crmTask.create({
        data: {
          title: `Enviar presupuesto - ${contact?.company || `${contact?.firstName || ""} ${contact?.lastName || ""}`.trim()}`,
          done: false,
          priority: "HIGH",
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          userId: session.user.id,
        },
      });
    }

    const contactName = contact?.company || `${contact?.firstName || ""} ${contact?.lastName || ""}`.trim();
    const methodLabel: Record<string, string> = { PHONE: "Llamada", WHATSAPP: "WhatsApp", EMAIL: "Email" };
    const operatorName = session.user.name || "Operador";

    await logOperatorAction({
      userId: session.user.id,
      action: "CONTACT_ACTIVITY",
      entityType: "ACTIVITY",
      entityId: activityId,
      description: `Registró actividad con "${contactName}" vía ${methodLabel[body.contactMethod] || body.contactMethod} · Interés: ${body.interestLevel}`,
      link: "/activities",
    });

    // Auto-create timeline activity
    try {
      await prisma.leadActivity.create({
        data: {
          contactId: body.contactId,
          userId: session.user.id,
          type: "STATUS_CHANGE",
          title: "Contactado",
          description: `Vía ${methodLabel[body.contactMethod] || body.contactMethod} · Interés: ${body.interestLevel}${body.notes ? ` · ${body.notes}` : ""}`,
        },
      });
    } catch { /* non-critical */ }

    if (session.user.role === "OPERATOR") {
      await notifyAdmins({
        type: "CONTACT_ACTIVITY",
        title: "Actividad de contacto registrada",
        message: `<strong>${escapeHtml(operatorName)}</strong> registró una actividad con <strong>${escapeHtml(contactName)}</strong> vía ${escapeHtml(methodLabel[body.contactMethod] || body.contactMethod)}.`,
        link: "/activities",
      });
    }

    return NextResponse.json({ ok: true, id: activityId });
  } catch (error) {
    log.error({ err: error }, "Error creating activity");
    return NextResponse.json({ error: "Error al registrar actividad" }, { status: 500 });
  }
}
