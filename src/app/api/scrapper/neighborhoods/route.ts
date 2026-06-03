import { NextResponse } from "next/server";
import { AR_NEIGHBORHOODS } from "@/lib/argentina-geo";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const province = searchParams.get("province")?.trim();
  const city = searchParams.get("city")?.trim();

  if (!province || !city) {
    return NextResponse.json({ neighborhoods: [] });
  }

  const citiesMap = AR_NEIGHBORHOODS[province];
  if (!citiesMap) {
    return NextResponse.json({ neighborhoods: [] });
  }

  // Try exact match first, then case-insensitive
  let neighborhoods = citiesMap[city];
  if (!neighborhoods) {
    const cityLower = city.toLowerCase();
    const key = Object.keys(citiesMap).find(
      (k) => k.toLowerCase() === cityLower
    );
    neighborhoods = key ? citiesMap[key] : [];
  }

  return NextResponse.json({ neighborhoods: neighborhoods ?? [] });
}
