import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/whatsapp/status");

export async function GET() {
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

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/status`, {
      method: "GET",
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Error consultando el servicio de WhatsApp" },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json({ connected: !!data?.connected });
  } catch (error) {
    log.error({ err: error }, "Error fetching WhatsApp status");
    return NextResponse.json(
      { error: "Error consultando el servicio de WhatsApp" },
      { status: 502 }
    );
  }
}
