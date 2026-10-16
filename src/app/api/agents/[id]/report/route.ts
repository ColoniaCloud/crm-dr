import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { transporter, FROM, isSmtpConfigured } from "@/lib/mailer";
import { escapeHtml } from "@/lib/notifications";
import { formatLocalDate } from "@/lib/agents/schedule";
import { buildCollectionsReport, montos, reportToCsv, reportToPdf } from "@/lib/agents/collections/report";
import { loadAgentFor, parseLocalDay, requireActor } from "@/lib/agents/api";

const log = createLogger("api/agents/report");

/** Descarga el reporte de un período: `?from=YYYY-MM-DD&to=YYYY-MM-DD&format=pdf|csv`. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const found = await loadAgentFor(gate.value, id);
  if (!found.ok) return found.response;

  const sp = new URL(req.url).searchParams;
  const from = parseLocalDay(sp.get("from"), false);
  const to = parseLocalDay(sp.get("to"), true);
  if (!from || !to || from > to) return NextResponse.json({ error: "Período inválido" }, { status: 400 });

  const report = await buildCollectionsReport(id, from, to);
  const base = `cobranzas_${sp.get("from")}_${sp.get("to")}`;
  if (sp.get("format") === "csv") {
    return new NextResponse(reportToCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.csv"`,
      },
    });
  }
  return new NextResponse(new Uint8Array(reportToPdf(report)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${base}.pdf"`,
    },
  });
}

const mailSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Manda el reporte (PDF + CSV) al mail de quien lo pide. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const found = await loadAgentFor(gate.value, id);
  if (!found.ok) return found.response;

  const parsed = mailSchema.safeParse(await req.json().catch(() => null));
  const from = parsed.success ? parseLocalDay(parsed.data.from, false) : null;
  const to = parsed.success ? parseLocalDay(parsed.data.to, true) : null;
  if (!parsed.success || !from || !to || from > to) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }
  if (!isSmtpConfigured()) return NextResponse.json({ error: "El correo del CRM no está configurado" }, { status: 503 });

  const user = await prisma.user.findUnique({ where: { id: gate.value.userId }, select: { email: true } });
  if (!user?.email) return NextResponse.json({ error: "Tu usuario no tiene email" }, { status: 400 });

  try {
    const report = await buildCollectionsReport(id, from, to);
    const periodo = `${formatLocalDate(from)} al ${formatLocalDate(to)}`;
    const base = `cobranzas_${parsed.data.from}_${parsed.data.to}`;
    await transporter.sendMail({
      from: FROM("Agentes del CRM"),
      to: user.email,
      subject: `Reporte de cobranzas — ${report.agentName} — ${periodo}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827">
        <p>Reporte de cobranzas del ${escapeHtml(periodo)}.</p>
        <ul>
          <li>Avisos enviados: ${report.totals.enviados}</li>
          <li>Esperando aprobación: ${report.totals.pendientes}</li>
          <li>Cobrado después de un aviso: ${escapeHtml(montos(report.totals.cobradoDespues))}</li>
          <li>Deuda vencida hoy: ${escapeHtml(montos(report.deudaHoy.vencidaPorMoneda))}</li>
          <li>Para seguimiento personal: ${report.deudaHoy.escaladas.length}</li>
        </ul>
        <p>El detalle va adjunto en PDF y en CSV (se abre con Excel).</p>
      </div>`,
      attachments: [
        { filename: `${base}.pdf`, content: reportToPdf(report), contentType: "application/pdf" },
        { filename: `${base}.csv`, content: reportToCsv(report), contentType: "text/csv; charset=utf-8" },
      ],
    });
    return NextResponse.json({ ok: true, to: user.email });
  } catch (err) {
    log.error({ err }, "No se pudo mandar el reporte");
    return NextResponse.json({ error: "No se pudo mandar el reporte" }, { status: 500 });
  }
}
