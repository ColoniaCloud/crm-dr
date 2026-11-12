import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { WHATSAPP_ROLES } from "@/lib/whatsapp/access";
import { listConversations } from "@/lib/whatsapp/inbox";
import { linesFor, type WhatsAppLineInfo } from "@/lib/whatsapp/lines";

const log = createLogger("api/whatsapp/lines");

/**
 * Las bandejas que puede usar quien pregunta, con cuántas conversaciones esperan
 * respuesta en cada una. La pantalla arma con esto el selector (si hay más de
 * una) y el aviso de que en la otra bandeja hay algo sin contestar.
 */
export async function GET() {
  const gate = await requireRole(WHATSAPP_ROLES);
  if (!gate.success) return gate.response;

  try {
    const lines: WhatsAppLineInfo[] = await Promise.all(
      linesFor(gate.session.user).map(async (line) => ({
        key: line.key,
        label: line.label,
        primary: line.primary,
        awaiting: (await listConversations(line)).filter((c) => c.awaitingReply).length,
      }))
    );
    return NextResponse.json({ lines });
  } catch (error) {
    log.error({ err: error }, "Error listing WhatsApp lines");
    return NextResponse.json({ error: "No se pudieron cargar las bandejas" }, { status: 500 });
  }
}
