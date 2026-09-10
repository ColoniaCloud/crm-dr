import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { notifyOverdueInstallments } from "@/lib/overdue-installments";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron-overdue");

export async function POST(req: Request) {
  const gate = requireCronSecret(req);
  if (!gate.success) return gate.response;

  try {
    const resultado = await notifyOverdueInstallments();
    if (!resultado) return NextResponse.json({ ok: true, salteado: true });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    log.error({ err }, "Overdue check cycle failed");
    return NextResponse.json({ error: "La revisión de cuotas falló" }, { status: 500 });
  }
}
