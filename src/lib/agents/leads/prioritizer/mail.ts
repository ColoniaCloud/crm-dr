import type { Agent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { esDemo } from "@/lib/demo-context";
import { transporter, FROM, isSmtpConfigured } from "@/lib/mailer";
import { escapeHtml } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
import { zoneKey, zoneLabel } from "@/lib/agents/leads/geo";
import { sectorLabel } from "@/lib/agents/leads/prioritizer/config";

const log = createLogger("agents/prioritizer-mail");

/**
 * El mail de la mañana: a cada vendedor, su lista del día (decisión L5).
 *
 * Lleva teléfono, WhatsApp y email de cada lead porque es para el vendedor, que
 * los necesita para llamar. La regla de que la IA no ve datos de contacto sigue
 * en pie: este mail lo arma el código, no el modelo.
 *
 * Fuera de producción no sale (la base de desarrollo tiene los usuarios reales).
 */
export async function sendMorningMails(agent: Agent, sellerIds: string[]): Promise<number> {
  if (esDemo() || process.env.NODE_ENV !== "production" || !isSmtpConfigured()) return 0;
  const origin = (process.env.NEXTAUTH_URL || "https://crm.kristallfilm.com").replace(/\/$/, "");
  let enviados = 0;

  for (const userId of sellerIds) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
      if (!user?.email) continue;
      const tareas = await prisma.crmTask.findMany({
        where: { agentId: agent.id, userId, done: false },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      });
      if (tareas.length === 0) continue;
      const contactos = await prisma.contact.findMany({
        where: { id: { in: tareas.map((t) => t.contactId).filter((x): x is string => Boolean(x)) } },
        select: { id: true, firstName: true, lastName: true, company: true, sector: true, state: true, city: true, phone: true, whatsapp: true, email: true },
      });
      const porId = new Map(contactos.map((c) => [c.id, c]));

      const filas = tareas
        .map((t) => {
          const c = t.contactId ? porId.get(t.contactId) : undefined;
          if (!c) return "";
          const nombre = c.company?.trim() || `${c.firstName} ${c.lastName}`.trim();
          const wa = (c.whatsapp || c.phone || "").replace(/\D/g, "");
          const medios = [
            c.phone ? `Tel: ${escapeHtml(c.phone)}` : null,
            wa ? `<a href="https://wa.me/${wa}">WhatsApp</a>` : null,
            c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : null,
          ].filter(Boolean).join(" · ");
          const notas = t.notes ? escapeHtml(t.notes).replace(/\n/g, "<br>") : "";
          return `<tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb">
            <a href="${origin}/leads/${c.id}" style="font-weight:bold;color:#111827">${escapeHtml(nombre)}</a>
            <span style="color:#6b7280"> — ${escapeHtml(sectorLabel(c.sector))} · ${escapeHtml(zoneLabel(zoneKey(c.state, c.city)))}</span><br>
            <span style="font-size:13px">${medios}</span><br>
            <span style="font-size:13px;color:#374151">${notas}</span>
          </td></tr>`;
        })
        .join("");

      await transporter.sendMail({
        from: FROM(agent.name),
        to: user.email,
        subject: `Tu lista de hoy: ${tareas.length} lead(s) para contactar`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827;max-width:640px">
          <p>Hola ${escapeHtml(user.name.split(" ")[0])}, esta es tu lista de hoy, ordenada por prioridad.</p>
          <p style="color:#6b7280;font-size:13px">Cuando contactes a cada uno, marcá la tarea como hecha en el CRM y cargá cómo salió: con eso el agente aprende y arma mejor la próxima lista.</p>
          <table style="width:100%;border-collapse:collapse">${filas}</table>
          <p><a href="${origin}/assistant" style="display:inline-block;background:#111827;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir mis tareas</a></p>
        </div>`,
      });
      enviados++;
    } catch (err) {
      log.error({ err, userId }, "No se pudo mandar el mail de la mañana");
    }
  }
  return enviados;
}
