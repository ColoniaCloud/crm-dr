import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { pollAllMailboxes } from "@/lib/mail-poller";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron-mail");

export async function POST(req: Request) {
  const gate = requireCronSecret(req);
  if (!gate.success) return gate.response;

  try {
    const resultado = await pollAllMailboxes();
    if (!resultado) return NextResponse.json({ ok: true, salteado: true });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    log.error({ err }, "Mail poll cycle failed");
    return NextResponse.json({ error: "El ciclo de correo falló" }, { status: 500 });
  }
}
