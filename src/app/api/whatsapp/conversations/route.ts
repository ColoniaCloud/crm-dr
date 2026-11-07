import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { listConversations } from "@/lib/whatsapp/inbox";

const log = createLogger("api/whatsapp/conversations");

/** Lista de conversaciones de la bandeja, la más reciente primero. `?q=` busca por nombre o número. */
export async function GET(request: Request) {
  const gate = await requireRole(["SUPERADMIN"]);
  if (!gate.success) return gate.response;

  try {
    const q = new URL(request.url).searchParams.get("q") ?? undefined;
    return NextResponse.json({ conversations: await listConversations(q) });
  } catch (error) {
    log.error({ err: error }, "Error listing WhatsApp conversations");
    return NextResponse.json({ error: "Error al cargar las conversaciones" }, { status: 500 });
  }
}
