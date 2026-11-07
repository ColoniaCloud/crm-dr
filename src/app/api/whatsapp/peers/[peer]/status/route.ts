import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { WHATSAPP_ROLES } from "@/lib/whatsapp/access";
import { getPeerStatus } from "@/lib/whatsapp/inbox";
import { looksLikeWaNumber, peerKey } from "@/lib/whatsapp/peer";

const log = createLogger("api/whatsapp/peer-status");

/** ¿Ya hay conversación con este número, y la ventana de 24 h sigue abierta? */
export async function GET(_req: Request, { params }: { params: Promise<{ peer: string }> }) {
  const gate = await requireRole(WHATSAPP_ROLES);
  if (!gate.success) return gate.response;

  const peer = peerKey((await params).peer);
  if (!looksLikeWaNumber(peer)) return NextResponse.json({ error: "Número inválido" }, { status: 400 });

  try {
    return NextResponse.json(await getPeerStatus(peer));
  } catch (error) {
    log.error({ err: error }, "Error reading WhatsApp peer status");
    return NextResponse.json({ error: "No se pudo consultar el número" }, { status: 500 });
  }
}
