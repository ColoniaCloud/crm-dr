import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/whatsapp/send-image");

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

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

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return NextResponse.json({ error: "FormData inválido" }, { status: 400 });
  }

  const number = normalizeNumber((incoming.get("number") as string) || "");
  const caption = ((incoming.get("caption") as string) || "").toString();
  const contactIdRaw = incoming.get("contactId");
  const contactId = typeof contactIdRaw === "string" && contactIdRaw ? contactIdRaw : null;
  const image = incoming.get("image");

  if (!number) return NextResponse.json({ error: "Número requerido" }, { status: 400 });
  if (!image || !(image instanceof File)) {
    return NextResponse.json({ error: "Imagen requerida" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(image.type)) {
    return NextResponse.json({ error: "Solo se permiten imágenes JPG o PNG" }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Imagen demasiado grande (máx 2MB)" }, { status: 400 });
  }

  try {
    const out = new FormData();
    out.append("number", number);
    out.append("caption", caption);
    out.append("image", image, image.name);

    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/send-image`, {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: out,
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
        message: caption || "(imagen)",
        status: success ? "SENT" : "FAILED",
        error: success ? null : (data?.error || `HTTP ${res.status}`).toString().slice(0, 500),
        sentById: session.user.id,
      },
    });

    if (!success) {
      return NextResponse.json(
        { success: false, error: data?.error || "Error enviando imagen" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: data?.messageId ?? null,
    });
  } catch (error) {
    log.error({ err: error }, "Error sending WhatsApp image");
    try {
      await prisma.whatsAppMessage.create({
        data: {
          contactId,
          phone: number,
          message: caption || "(imagen)",
          status: "FAILED",
          error: error instanceof Error ? error.message.slice(0, 500) : "Network error",
          sentById: session.user.id,
        },
      });
    } catch {
      // ignore
    }
    return NextResponse.json(
      { success: false, error: "Error enviando imagen" },
      { status: 502 }
    );
  }
}
