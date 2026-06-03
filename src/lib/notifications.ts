import { prisma } from "@/lib/prisma";
import { transporter, FROM } from "@/lib/mailer";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeWa(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return d;
  if (d.startsWith("54")) return d;
  if (d.startsWith("0")) return "54" + d.slice(1);
  if (d.length <= 10) return "54" + d;
  return d;
}

export interface AssignmentContact {
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
}

/**
 * Builds the rich HTML message for a call or visit assignment.
 * Used both for the in-app notification and the email body.
 */
export function buildAssignmentMessage(params: {
  eventType: "call" | "visit";
  contact: AssignmentContact;
  scheduledAt: string;
  durationMin?: number | null;
  notes?: string | null;
}): string {
  const { eventType, contact, scheduledAt, durationMin, notes } = params;

  const eventLabel = eventType === "call" ? "llamada" : "visita";
  const duration = durationMin ? ` (${durationMin} min)` : "";
  const location = [contact.city, contact.state].filter(Boolean).join(", ");
  const waNum = contact.whatsapp ? normalizeWa(contact.whatsapp) : null;

  const btn =
    "display:inline-block;padding:8px 18px;border-radius:6px;text-decoration:none;" +
    "font-size:13px;font-weight:600;margin:0 6px 6px 0;";

  const phoneBtn = contact.phone
    ? `<a href="tel:${escapeHtml(contact.phone)}" style="${btn}background:#1d4ed8;color:#fff;">📞 Llamar</a>`
    : "";
  const waBtn = waNum
    ? `<a href="https://wa.me/${escapeHtml(waNum)}" style="${btn}background:#16a34a;color:#fff;" target="_blank">💬 WhatsApp</a>`
    : "";
  const emailBtn = contact.email
    ? `<a href="mailto:${escapeHtml(contact.email)}" style="${btn}background:#7c3aed;color:#fff;">✉️ Email</a>`
    : "";

  const hasActions = phoneBtn || waBtn || emailBtn;

  return `
<p style="margin:0 0 14px 0;color:#333;font-size:14px;">
  Se te asignó una <strong>${eventLabel}</strong> para el
  <strong style="color:#111;">${escapeHtml(scheduledAt)}</strong>${escapeHtml(duration)}.
</p>
<div style="background:#f4f4f5;border-radius:8px;padding:14px 16px;margin-bottom:14px;border:1px solid #e4e4e7;">
  <p style="margin:0 0 6px 0;font-weight:700;font-size:15px;color:#111;">${escapeHtml(contact.name)}</p>
  ${location ? `<p style="margin:0 0 4px 0;color:#666;font-size:13px;">📍 ${escapeHtml(location)}</p>` : ""}
  ${contact.phone ? `<p style="margin:0 0 4px 0;color:#555;font-size:13px;">📞 ${escapeHtml(contact.phone)}</p>` : ""}
  ${contact.email ? `<p style="margin:0 0 4px 0;color:#555;font-size:13px;">✉️ ${escapeHtml(contact.email)}</p>` : ""}
  ${contact.whatsapp ? `<p style="margin:0;color:#555;font-size:13px;">💬 ${escapeHtml(contact.whatsapp)}</p>` : ""}
</div>
${hasActions ? `<div style="margin-bottom:${notes ? "14" : "0"}px;">${phoneBtn}${waBtn}${emailBtn}</div>` : ""}
${notes ? `<p style="margin:0;color:#555;font-size:13px;padding:10px 14px;background:#fffbeb;border-radius:6px;border-left:3px solid #f59e0b;">📝 <em>${escapeHtml(notes)}</em></p>` : ""}
  `.trim();
}

export interface NotifyPayload {
  userId: string;
  userEmail: string;
  userName: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  baseUrl?: string;
}

// Sends an in-app only notification to all admin users (no email)
export async function notifyAdmins(payload: {
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPERADMIN"] }, deletedAt: null },
      select: { id: true },
    });
    if (admins.length === 0) return;
    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        link: payload.link ?? null,
      })),
    });
  } catch (err) {
    console.error("[notifyAdmins] error:", err);
  }
}

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

let _paymentAuditTableReady = false;
export async function ensurePaymentAuditTable() {
  if (_paymentAuditTableReady) return;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS payment_audit_logs (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      saleId VARCHAR(191) NOT NULL,
      paymentId VARCHAR(191) NULL,
      userId VARCHAR(191) NOT NULL,
      action ENUM('CREATED','EDITED','DELETED') NOT NULL,
      oldValues TEXT NULL,
      newValues TEXT NULL,
      description TEXT NOT NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_pal_saleId (saleId),
      INDEX idx_pal_paymentId (paymentId),
      INDEX idx_pal_userId (userId),
      CONSTRAINT fk_pal_sale FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE,
      CONSTRAINT fk_pal_payment FOREIGN KEY (paymentId) REFERENCES payments(id) ON DELETE SET NULL,
      CONSTRAINT fk_pal_user FOREIGN KEY (userId) REFERENCES users(id)
    )
  `;
  _paymentAuditTableReady = true;
}

export async function logOperatorAction(params: {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  description: string;
  link?: string;
}) {
  try {
    await ensureAuditTable();
    const id = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO operator_audit_logs (id, userId, action, entityType, entityId, description, link)
      VALUES (${id}, ${params.userId}, ${params.action}, ${params.entityType}, ${params.entityId ?? null}, ${params.description}, ${params.link ?? null})
    `;
  } catch (err) {
    console.error("[logOperatorAction] error:", err);
  }
}

export async function sendNotification(payload: NotifyPayload) {
  const { userId, userEmail, userName, type, title, message, link, baseUrl } = payload;
  const origin = baseUrl || process.env.NEXTAUTH_URL || "";

  // 1. Save in-app notification
  await prisma.notification.create({
    data: { userId, type, title, message, link: link ?? null },
  });

  // 2. Send email (fire-and-forget, don't break if it fails)
  if (!process.env.SMTP_USER) return;

  const calendarLink = link?.startsWith("/notifications") ? "/calendar/calls" : link;
  const calendarBtn = calendarLink
    ? `<a href="${origin}${escapeHtml(calendarLink)}" style="display:inline-block;padding:10px 20px;background:#18181b;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">Ver en calendario</a>`
    : "";

  try {
    await transporter.sendMail({
      from: FROM(),
      to: userEmail,
      subject: title,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:540px;margin:0 auto;padding:24px;background:#f9fafb;">
          <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e5e7eb;">
            <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;">DR Polarizados</p>
            <h2 style="color:#111;margin:0 0 20px 0;font-size:20px;">${escapeHtml(title)}</h2>
            <p style="color:#444;margin:0 0 20px 0;">Hola <strong>${escapeHtml(userName)}</strong>,</p>
            <div>${message}</div>
            ${calendarBtn ? `<div style="margin-top:20px;">${calendarBtn}</div>` : ""}
          </div>
          <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px;">
            Mensaje automático de DR Polarizados · No respondas este correo.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[sendNotification] email error:", err);
  }
}
