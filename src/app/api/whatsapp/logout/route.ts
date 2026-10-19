import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { logOperatorAction } from "@/lib/notifications";
import { canManageWhatsAppConnection } from "@/lib/whatsapp-access";

const log = createLogger("api/whatsapp/logout");

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id || !canManageWhatsAppConnection(session.user)) {
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
    // Desvincular corta los envíos de todo el CRM hasta que alguien escanee un
    // QR nuevo, y ya no lo hace solo un SUPERADMIN: que quede quién fue.
    await logOperatorAction({
      userId: session.user.id,
      action: "WHATSAPP_LOGOUT",
      entityType: "WHATSAPP",
      description: `${session.user.name || session.user.email} desvinculó el número de WhatsApp del CRM`,
      link: "/whatsapp",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ err: error }, "Error logging out WhatsApp");
    return NextResponse.json(
      { error: "Error cerrando la sesión" },
      { status: 502 }
    );
  }
}
