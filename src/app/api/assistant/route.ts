import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { runAssistant } from "@/lib/assistant-core";
import type { AssistantApiResponse } from "@/types/assistant";

const log = createLogger("api/assistant");

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json<AssistantApiResponse>({ message: "", error: "No autorizado" }, { status: 401 });
  }

  try {
    const { message, history = [], csvRows, csvContactType } = await req.json() as {
      message: string;
      history: { role: "user" | "assistant"; content: string }[];
      csvRows?: Record<string, string>[];
      csvContactType?: string;
    };

    const { data, status } = await runAssistant({
      message,
      history,
      csvRows,
      csvContactType,
      actor: { userId: session.user.id, role: session.user.role },
      // The import_contacts_csv tool calls an internal /api/leads/import or
      // /api/installers/import-csv route, which is itself session-gated —
      // forward this request's session cookie so that internal call
      // authenticates as the same user.
      internalFetchHeaders: { Cookie: req.headers.get("cookie") || "" },
    });

    return NextResponse.json<AssistantApiResponse>(data, { status });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error({ err, detail }, "Error in assistant route");
    return NextResponse.json<AssistantApiResponse>({ message: "", error: detail }, { status: 500 });
  }
}
