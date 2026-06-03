import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/scrapper/autocomplete");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const input = searchParams.get("input");

  if (!input || input.trim().length < 2) {
    return NextResponse.json({ predictions: [] });
  }

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY no configurada" }, { status: 500 });
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", input.trim());
    url.searchParams.set("types", "(cities)");
    url.searchParams.set("components", "country:ar");
    url.searchParams.set("language", "es");
    url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY);

    const res = await fetch(url.toString());
    const data = await res.json();

    const predictions = (data.predictions ?? []).map((p: { description: string; place_id: string }) => ({
      description: p.description,
      place_id: p.place_id,
    }));

    return NextResponse.json({ predictions });
  } catch (err) {
    log.error({ err: err }, "Autocomplete error");
    return NextResponse.json({ predictions: [] });
  }
}
