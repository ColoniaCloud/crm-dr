import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";

const log = createLogger("api/whatsapp/campaign");

const MAX_CONTACTS = 200;
const MIN_DELAY = 2000;
const MAX_DELAY = 10000;

function normalizeNumber(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("54") || d.startsWith("598") || d.startsWith("549")) return d;
  if (d.startsWith("0")) return "54" + d.slice(1);
  if (d.length <= 10) return "54" + d;
  return d;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const baseUrl = process.env.WHATSAPP_SERVICE_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  if (!baseUrl || !apiKey) {
    return NextResponse.json({ error: "Servicio de WhatsApp no configurado" }, { status: 500 });
  }

  let body: {
    contactType: string;
    message: string;
    delaySeconds?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { contactType, message, delaySeconds = 3 } = body;

  if (!contactType || !["LEAD", "CLIENT", "INSTALLER"].includes(contactType)) {
    return NextResponse.json({ error: "contactType debe ser LEAD, CLIENT o INSTALLER" }, { status: 400 });
  }
  if (!message?.trim()) {
    return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
  }

  const delayMs = Math.min(MAX_DELAY, Math.max(MIN_DELAY, (delaySeconds ?? 3) * 1000));

  const contacts = await prisma.contact.findMany({
    where: {
      type: contactType as "LEAD" | "CLIENT" | "INSTALLER",
      OR: [
        { phone: { not: null } },
        { whatsapp: { not: null } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, phone: true, whatsapp: true },
    take: MAX_CONTACTS,
    orderBy: { createdAt: "desc" },
  });

  const withPhone = contacts.filter((c) => {
    const num = normalizeNumber((c.whatsapp || c.phone || ""));
    return num.length >= 10;
  });

  if (withPhone.length === 0) {
    return NextResponse.json({ error: "No hay contactos con número de teléfono válido" }, { status: 400 });
  }

  const results = { sent: 0, failed: 0, errors: [] as string[] };

  for (const contact of withPhone) {
    const number = normalizeNumber(contact.whatsapp || contact.phone || "");

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ number, message }),
      });

      let data: { success?: boolean; error?: string } = {};
      try { data = await res.json(); } catch { /* ignore */ }

      const success = res.ok && !!data?.success;

      await prisma.whatsAppMessage.create({
        data: {
          contactId: contact.id,
          phone: number,
          message,
          status: success ? "SENT" : "FAILED",
          error: success ? null : (data?.error || `HTTP ${res.status}`).toString().slice(0, 500),
          sentById: session.user.id,
        },
      });

      if (success) results.sent++;
      else {
        results.failed++;
        results.errors.push(`${contact.firstName} ${contact.lastName}: ${data?.error || `HTTP ${res.status}`}`);
      }
    } catch (err) {
      results.failed++;
      results.errors.push(`${contact.firstName} ${contact.lastName}: ${err instanceof Error ? err.message : "Error de red"}`);

      try {
        await prisma.whatsAppMessage.create({
          data: {
            contactId: contact.id,
            phone: number,
            message,
            status: "FAILED",
            error: err instanceof Error ? err.message.slice(0, 500) : "Error de red",
            sentById: session.user.id,
          },
        });
      } catch { /* ignore */ }
    }

    if (withPhone.indexOf(contact) < withPhone.length - 1) {
      await sleep(delayMs);
    }
  }

  await logOperatorAction({
    userId: session.user.id,
    action: "WHATSAPP_CAMPAIGN",
    entityType: "CONTACT",
    description: `Campaña WhatsApp a ${contactType}: ${results.sent} enviados, ${results.failed} fallidos`,
    link: "/whatsapp",
  });

  log.info({ sent: results.sent, failed: results.failed }, "Campaign completed");

  return NextResponse.json({
    success: true,
    total: withPhone.length,
    sent: results.sent,
    failed: results.failed,
    errors: results.errors.slice(0, 10),
  });
}

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const contactType = searchParams.get("contactType");

  if (!contactType || !["LEAD", "CLIENT", "INSTALLER"].includes(contactType)) {
    return NextResponse.json({ error: "contactType inválido" }, { status: 400 });
  }

  const count = await prisma.contact.count({
    where: {
      type: contactType as "LEAD" | "CLIENT" | "INSTALLER",
      OR: [{ phone: { not: null } }, { whatsapp: { not: null } }],
    },
  });

  return NextResponse.json({ count: Math.min(count, MAX_CONTACTS), total: count, capped: count > MAX_CONTACTS });
}
