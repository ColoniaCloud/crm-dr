import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/whatsapp/send");

function normalizeNumber(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("54") || d.startsWith("598") || d.startsWith("549")) return d;
  if (d.startsWith("0")) return "54" + d.slice(1);
  if (d.length <= 10) return "54" + d;
  return d;
}

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const baseUrl = process.env.WHATSAPP_SERVICE_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "Servicio de WhatsApp no configurado" },
      { status: 500 }
    );
  }

  let body: { number?: string; message?: string; contactId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const number = normalizeNumber(body.number || "");
  const message = (body.message || "").toString();
  const contactId = body.contactId || null;

  if (!number) return NextResponse.json({ error: "Número requerido" }, { status: 400 });
  if (!message.trim()) return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ number, message }),
    });

    let data: { success?: boolean; messageId?: string; error?: string } = {};
    try {
      data = await res.json();
    } catch {
      // ignore parse errors
    }

    const success = res.ok && !!data?.success;

    await prisma.whatsAppMessage.create({
      data: {
        contactId,
        phone: number,
        message,
        status: success ? "SENT" : "FAILED",
        error: success ? null : (data?.error || `HTTP ${res.status}`).toString().slice(0, 500),
        sentById: session.user.id,
      },
    });

    if (!success) {
      return NextResponse.json(
        { success: false, error: data?.error || "Error enviando mensaje" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: data?.messageId ?? null,
    });
  } catch (error) {
    log.error({ err: error }, "Error sending WhatsApp message");
    try {
      await prisma.whatsAppMessage.create({
        data: {
          contactId,
          phone: number,
          message,
          status: "FAILED",
          error: error instanceof Error ? error.message.slice(0, 500) : "Network error",
          sentById: session.user.id,
        },
      });
    } catch {
      // ignore log persistence errors
    }
    return NextResponse.json(
      { success: false, error: "Error enviando mensaje" },
      { status: 502 }
    );
  }
}
