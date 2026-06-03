import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/whatsapp/qr");

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
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/qr`, {
      method: "GET",
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Error consultando el QR" },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json({ qr: data?.qr ?? null });
  } catch (error) {
    console.error("WhatsApp QR fetch failed:", error);
    console.error("URL:", `${baseUrl}/qr`);
    console.error("API Key exists:", !!apiKey);
    log.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error fetching WhatsApp QR"
    );
    return NextResponse.json(
      { error: "Error consultando el QR" },
      { status: 502 }
    );
  }
}
