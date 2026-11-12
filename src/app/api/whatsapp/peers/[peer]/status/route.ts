import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { getPeerStatus } from "@/lib/whatsapp/inbox";
import { requireWhatsAppLine } from "@/lib/whatsapp/line-access";
import { looksLikeWaNumber, peerKey } from "@/lib/whatsapp/peer";

const log = createLogger("api/whatsapp/peer-status");

/** ¿Ya hay conversación con este número en la línea de quien pregunta, y la ventana de 24 h sigue abierta? */
export async function GET(request: Request, { params }: { params: Promise<{ peer: string }> }) {
  const gate = await requireWhatsAppLine(request);
  if (!gate.success) return gate.response;

  const peer = peerKey((await params).peer);
  if (!looksLikeWaNumber(peer)) return NextResponse.json({ error: "Número inválido" }, { status: 400 });

  try {
    return NextResponse.json(await getPeerStatus(peer, gate.line));
  } catch (error) {
    log.error({ err: error }, "Error reading WhatsApp peer status");
    return NextResponse.json({ error: "No se pudo consultar el número" }, { status: 500 });
  }
}
