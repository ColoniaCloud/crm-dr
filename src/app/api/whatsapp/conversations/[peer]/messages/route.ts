import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api-validation";
import { createLogger } from "@/lib/logger";
import { esDemo } from "@/lib/demo-context";
import { isCloudApiConfigured } from "@/lib/whatsapp/client";
import { InboxSendError, getThread, sendToPeer } from "@/lib/whatsapp/inbox";
import { requireWhatsAppLine } from "@/lib/whatsapp/line-access";
import { looksLikeWaNumber, peerKey } from "@/lib/whatsapp/peer";

const log = createLogger("api/whatsapp/messages");

type Ctx = { params: Promise<{ peer: string }> };

/** Un chat de una línea (`?line=`). `?before=<ISO>` trae los mensajes anteriores a esa fecha. */
export async function GET(request: Request, { params }: Ctx) {
  const gate = await requireWhatsAppLine(request);
  if (!gate.success) return gate.response;

  const peer = peerKey((await params).peer);
  if (!looksLikeWaNumber(peer)) return NextResponse.json({ error: "Número inválido" }, { status: 400 });

  const rawBefore = new URL(request.url).searchParams.get("before");
  const before = rawBefore ? new Date(rawBefore) : undefined;
  if (before && Number.isNaN(before.getTime())) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  try {
    return NextResponse.json(await getThread(peer, gate.line, before));
  } catch (error) {
    log.error({ err: error }, "Error loading WhatsApp thread");
    return NextResponse.json({ error: "Error al cargar la conversación" }, { status: 500 });
  }
}

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(4096) }),
  z.object({
    kind: z.literal("template"),
    name: z.string().min(1).max(512),
    language: z.string().min(2).max(16),
    params: z.array(z.string().max(1000)).max(20),
  }),
]);

/** Manda un texto libre (dentro de las 24 h) o una plantilla aprobada, por el número de la línea. */
export async function POST(request: Request, { params }: Ctx) {
  const gate = await requireWhatsAppLine(request);
  if (!gate.success) return gate.response;

  if (esDemo()) return NextResponse.json({ error: "No disponible en la demostración" }, { status: 403 });

  const peer = peerKey((await params).peer);
  if (!looksLikeWaNumber(peer)) return NextResponse.json({ error: "Número inválido" }, { status: 400 });

  const validation = validateBody(schema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;

  if (!isCloudApiConfigured()) {
    return NextResponse.json({ error: "WhatsApp (Cloud API) no está configurado" }, { status: 503 });
  }

  try {
    const { wamid } = await sendToPeer(peer, validation.data, gate.session.user.id, gate.line);
    return NextResponse.json({ ok: true, wamid });
  } catch (error) {
    if (error instanceof InboxSendError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    log.error({ err: error }, "Error sending WhatsApp message");
    return NextResponse.json({ error: "No se pudo enviar el mensaje" }, { status: 500 });
  }
}
