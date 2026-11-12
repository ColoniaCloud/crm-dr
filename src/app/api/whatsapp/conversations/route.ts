import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { listConversations } from "@/lib/whatsapp/inbox";
import { requireWhatsAppLine } from "@/lib/whatsapp/line-access";

const log = createLogger("api/whatsapp/conversations");

/**
 * Lista de conversaciones de una bandeja, la más reciente primero. `?q=` busca
 * por nombre o número; `?line=` elige la línea entre las que la persona puede
 * usar (ver `line-access.ts`).
 */
export async function GET(request: Request) {
  const gate = await requireWhatsAppLine(request);
  if (!gate.success) return gate.response;

  try {
    const q = new URL(request.url).searchParams.get("q") ?? undefined;
    return NextResponse.json({ conversations: await listConversations(gate.line, q) });
  } catch (error) {
    log.error({ err: error }, "Error listing WhatsApp conversations");
    return NextResponse.json({ error: "Error al cargar las conversaciones" }, { status: 500 });
  }
}
