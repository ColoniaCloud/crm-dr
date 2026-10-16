import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { runDueAgents } from "@/lib/agents/runner";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron-agents");

/**
 * Lo llama el cron del VPS cada 15 minutos. Corre los agentes activos cuyo
 * horario ya llegó; si no le toca a ninguno, no hace nada.
 */
export async function POST(req: Request) {
  const gate = requireCronSecret(req);
  if (!gate.success) return gate.response;

  try {
    const resultados = await runDueAgents();
    return NextResponse.json({ ok: true, resultados });
  } catch (err) {
    log.error({ err }, "Agents cron cycle failed");
    return NextResponse.json({ error: "La ronda de agentes falló" }, { status: 500 });
  }
}
