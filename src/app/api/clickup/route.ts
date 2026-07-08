import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

export async function GET() {
  const gate = await requireRole();
  if (!gate.success) return gate.response;

  const apiKey = process.env.CLICKUP_API_KEY;
  const listId = process.env.CLICKUP_LIST_ID;

  if (!apiKey || !listId) {
    return NextResponse.json({ error: "ClickUp no configurado" }, { status: 503 });
  }

  try {
    const res = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task?statuses[]=to%20do&statuses[]=in%20progress&include_closed=false`,
      { headers: { Authorization: apiKey }, next: { revalidate: 300 } }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `ClickUp error: ${err}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data.tasks ?? []);
  } catch {
    return NextResponse.json({ error: "Error al conectar con ClickUp" }, { status: 500 });
  }
}
