import { NextResponse } from "next/server";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { withMobileCors, mobileCorsPreflight } from "@/lib/mobile-cors";
import { runAssistant } from "@/lib/assistant-core";
import { createLogger } from "@/lib/logger";
import type { AssistantApiResponse } from "@/types/assistant";

const log = createLogger("api/mobile/v1/assistant");

export function OPTIONS() {
  return mobileCorsPreflight();
}

export async function POST(req: Request) {
  const gate = await requireMobileAuth(req);
  if (!gate.success) return withMobileCors(gate.response);

  try {
    const { message, history = [], csvRows, csvContactType } = await req.json() as {
      message: string;
      history: { role: "user" | "assistant"; content: string }[];
      csvRows?: Record<string, string>[];
      csvContactType?: string;
    };

    const authHeader = req.headers.get("authorization") || "";

    const { data, status } = await runAssistant({
      message,
      history,
      csvRows,
      csvContactType,
      actor: { userId: gate.user.sub, role: gate.user.role },
      // Note: the import_contacts_csv tool's internal fetch hits
      // /api/leads/import and /api/installers/import-csv, which are gated by
      // NextAuth session (cookie), not by this JWT — forwarding the bearer
      // token here won't authenticate against those routes. There's no CSV
      // attach UI in the mobile app anyway, so this tool is effectively
      // unreachable from mobile chat today; forwarding it is just honest
      // plumbing rather than a working path.
      internalFetchHeaders: authHeader ? { Authorization: authHeader } : {},
    });

    return withMobileCors(NextResponse.json<AssistantApiResponse>(data, { status }));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error({ err, detail }, "Error in mobile assistant route");
    return withMobileCors(NextResponse.json<AssistantApiResponse>({ message: "", error: detail }, { status: 500 }));
  }
}
