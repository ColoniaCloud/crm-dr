import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/whatsapp/logout");

export async function DELETE() {
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
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/logout`, {
      method: "DELETE",
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.error || "";
      } catch {
        // ignore
      }
      return NextResponse.json(
        { error: detail || "Error cerrando la sesión" },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ err: error }, "Error logging out WhatsApp");
    return NextResponse.json(
      { error: "Error cerrando la sesión" },
      { status: 502 }
    );
  }
}
