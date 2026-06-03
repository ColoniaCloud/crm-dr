import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
const log = createLogger("api/scrapper/search");

const MAPS_KEY = () => process.env.GOOGLE_MAPS_API_KEY ?? "";

interface PlaceResult {
  place_id: string;
  name: string;
  vicinity?: string;
  formatted_address?: string;
  geometry: { location: { lat: number; lng: number } };
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
  photos?: unknown[];
}

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface PlaceDetails {
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  formatted_address?: string;
  address_components?: AddressComponent[];
  business_status?: string;
}

async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("fields", "formatted_phone_number,international_phone_number,website,formatted_address,address_components,business_status");
    url.searchParams.set("language", "es");
    url.searchParams.set("key", MAPS_KEY());
    const res = await fetch(url.toString());
    const data = await res.json();
    return (data.result ?? {}) as PlaceDetails;
  } catch {
    return {};
  }
}

/**
 * Parse address_components from Google Places into street, city, province.
 */
function parseAddressComponents(components?: AddressComponent[]): {
  street: string;
  city: string;
  province: string;
} {
  if (!components) return { street: "", city: "", province: "" };

  let streetNumber = "";
  let route = "";
  let city = "";
  let sublocality = "";
  let province = "";

  for (const c of components) {
    if (c.types.includes("street_number")) streetNumber = c.long_name;
    else if (c.types.includes("route")) route = c.long_name;
    else if (c.types.includes("sublocality_level_1") || c.types.includes("sublocality")) {
      if (!sublocality) sublocality = c.long_name;
    }
    else if (c.types.includes("locality") || c.types.includes("administrative_area_level_2")) {
      if (!city) city = c.long_name;
    }
    else if (c.types.includes("administrative_area_level_1")) province = c.long_name;
  }

  // Normalize CABA: Google returns various names for the same province
  const provLower = province.toLowerCase();
  if (
    provLower.includes("ciudad autónoma") ||
    provLower.includes("ciudad autonoma") ||
    provLower === "caba" ||
    provLower === "capital federal" ||
    provLower.includes("c.a.b.a")
  ) {
    province = "CABA";
    // For CABA, use sublocality (barrio) as city if no locality was found
    if (!city && sublocality) city = sublocality;
  }

  const street = [route, streetNumber].filter(Boolean).join(" ").trim();
  return { street, city, province };
}

/**
 * Normalize an Argentine phone number.
 * Returns { phone, isWhatsApp }.
 * Mobile = starts with +54 9 or local mobile patterns (11, 15, etc.)
 */
function normalizeArgPhone(raw: string): { phone: string; isWhatsApp: boolean } {
  if (!raw) return { phone: "", isWhatsApp: false };

  // Remove all non-digit chars except leading +
  let digits = raw.replace(/[^\d+]/g, "");

  // If it starts with +, keep it; otherwise prepend context
  if (digits.startsWith("+54")) {
    // Already international format
  } else if (digits.startsWith("54")) {
    digits = "+" + digits;
  } else if (digits.startsWith("0")) {
    // Local format: 0XX-XXXX-XXXX → +54 XX XXXX XXXX
    digits = "+54" + digits.slice(1);
  } else if (digits.length >= 10) {
    digits = "+54" + digits;
  }

  // Argentine mobile: +54 9 XX XXXX XXXX (the 9 indicates mobile)
  const isMobile = digits.includes("+549") ||
    raw.includes("15 ") || raw.includes("15-") ||
    (/\+54\d{10}$/.test(digits) && !digits.startsWith("+5411"));

  return { phone: digits, isWhatsApp: isMobile };
}

// Geocode using Nominatim (OSM) — free, no API key needed
// Uses structured search (city + state) to avoid ambiguity with street names
async function geocodeNominatim(city: string, province: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("city", city);
    url.searchParams.set("state", province);
    url.searchParams.set("country", "Argentina");
    url.searchParams.set("format", "json");
    url.searchParams.set("countrycodes", "ar");
    url.searchParams.set("limit", "1");
    url.searchParams.set("accept-language", "es");
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "CRM-Polarizados/1.0" },
    });
    const data = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

// Geocode city+province to lat/lng — tries Google first, falls back to Nominatim
async function geocode(city: string, province: string): Promise<{ lat: number; lng: number } | null> {
  const query = `${city}, ${province}, Argentina`;

  // Try Google Geocoding first
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    // Restrict by country AND province to avoid confusing city names with street names
    url.searchParams.set("components", `country:AR|administrative_area:${province}`);
    url.searchParams.set("language", "es");
    url.searchParams.set("key", MAPS_KEY());

    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.status === "OK" && data.results?.length) {
      // Filtrar resultados para evitar calles homónimas
      // Preferimos results que tengan types incluyendo 'locality', 'political', 'administrative_area_level_2', pero NO 'route'
      const prefer = data.results.find((r: any) =>
        r.types.includes("locality") ||
        r.types.includes("administrative_area_level_2") ||
        (r.types.includes("political") && !r.types.includes("route"))
      );
      if (prefer) {
        return prefer.geometry.location;
      }
      // Si no hay preferido, evitar results que sean solo 'route'
      const notRoute = data.results.find((r: any) => !r.types.includes("route"));
      if (notRoute) {
        return notRoute.geometry.location;
      }
      // Si no hay otra opción, usar el primero (comportamiento anterior)
      return data.results[0].geometry.location;
    }
    log.warn({ query, status: data.status }, "Google geocode failed, trying Nominatim");
  } catch (err) {
    log.warn({ err, query }, "Google geocode error, trying Nominatim");
  }

  // Fallback to Nominatim (OpenStreetMap) — uses structured search
  return geocodeNominatim(city, province);
}

// Follow pagination tokens (up to maxPages extra pages)
async function followPages(
  token: string | undefined,
  endpoint: string,
  maxPages: number
): Promise<PlaceResult[]> {
  let results: PlaceResult[] = [];
  let nextToken = token;
  for (let page = 0; page < maxPages && nextToken; page++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const nextUrl = new URL(endpoint);
      nextUrl.searchParams.set("pagetoken", nextToken);
      nextUrl.searchParams.set("key", MAPS_KEY());
      const nextRes = await fetch(nextUrl.toString());
      const nextData = await nextRes.json();
      if (nextData.results) results = results.concat(nextData.results as PlaceResult[]);
      nextToken = nextData.next_page_token;
    } catch {
      break;
    }
  }
  return results;
}

// One Nearby Search call — follows up to 2 extra pages (max 60 results per query)
async function nearbySearch(
  lat: number,
  lng: number,
  radiusM: number,
  keyword: string,
  type?: string
): Promise<PlaceResult[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(radiusM));
  url.searchParams.set("language", "es");
  url.searchParams.set("key", MAPS_KEY());
  if (keyword) url.searchParams.set("keyword", keyword);
  if (type) url.searchParams.set("type", type);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status === "REQUEST_DENIED") {
    throw new Error(`Google Places API no habilitada: ${data.error_message || "REQUEST_DENIED"}`);
  }

  let results: PlaceResult[] = (data.results ?? []) as PlaceResult[];
  const extra = await followPages(
    data.next_page_token,
    "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
    2
  );
  results = results.concat(extra);

  return results;
}

// Text Search — much better for finding businesses by category/name in a city
// Returns semantically richer results than Nearby Search
async function textSearch(
  query: string,
  lat: number,
  lng: number,
  radiusM: number
): Promise<PlaceResult[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(radiusM));
  url.searchParams.set("language", "es");
  url.searchParams.set("region", "ar");
  url.searchParams.set("key", MAPS_KEY());

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status === "REQUEST_DENIED") {
    throw new Error(`Google Places API no habilitada: ${data.error_message || "REQUEST_DENIED"}`);
  }

  let results: PlaceResult[] = (data.results ?? []) as PlaceResult[];
  const extra = await followPages(
    data.next_page_token,
    "https://maps.googleapis.com/maps/api/place/textsearch/json",
    2
  );
  results = results.concat(extra);

  return results;
}

// Car brands commonly found in Argentine dealership names
const CAR_BRANDS = [
  "toyota", "ford", "fiat", "volkswagen", "chevrolet", "renault", "peugeot",
  "citroen", "citroën", "honda", "hyundai", "kia", "nissan", "jeep", "ram",
  "dodge", "chrysler", "mitsubishi", "suzuki", "subaru", "mazda", "bmw",
  "mercedes", "mercedes-benz", "audi", "volvo", "lexus", "jaguar", "land rover",
  "porsche", "alfa romeo", "ds", "chery", "geely", "haval", "great wall",
  "byd", "jetour", "omoda", "changan", "dfsk", "gwm", "iveco", "scania",
  "isuzu", "hino", "man", "volvo trucks", "mercedes-benz camiones",
];

function inferType(types: string[] = [], name: string): string {
  const n = name.toLowerCase();
  if (
    types.includes("car_dealer") ||
    n.includes("concesion") ||
    n.includes("automotora") ||
    n.includes("agencia de auto") ||
    n.includes("multimarca") ||
    n.includes("0km") ||
    n.includes("0 km") ||
    n.includes("plan de ahorro") ||
    n.includes("plan ovalo") ||
    n.includes("plan rombo") ||
    n.includes("dealer") ||
    n.includes("oficial") ||
    n.includes("seminuevo") ||
    n.includes("usados y 0km") ||
    n.includes("vehiculos nuevos") ||
    n.includes("vehículos nuevos") ||
    n.includes("car dealer") ||
    n.includes("venta de autos") ||
    n.includes("compra venta") ||
    CAR_BRANDS.some((brand) => n.includes(brand))
  )
    return "Concesionarias";
  if (n.includes("vidrier") || n.includes("glass") || n.includes("vidrio") || n.includes("cristaler") || n.includes("aberturas")) return "Vidriería/Glass";
  if (n.includes("arquitect") || n.includes("construct") || n.includes("obra") || n.includes("inmobiliar") || n.includes("estudio")) return "Arquitectura";
  if (types.includes("car_wash") || n.includes("detailing") || n.includes("autodetailing")) return "Talleres/Autodetailing";
  return "Talleres/Autodetailing";
}

export async function POST(request: Request) {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_MAPS_API_KEY no configurada. Agregala en las variables de entorno." },
      { status: 500 }
    );
  }

  let body: {
    city: string;
    province: string;
    radiusKm: number;
    types?: string[];
    neighborhood?: string;
    customLat?: number;
    customLng?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { city, province, radiusKm = 3, neighborhood, customLat, customLng } = body;

  if (!city?.trim() || !province?.trim()) {
    return NextResponse.json({ error: "Los campos ciudad y provincia son requeridos" }, { status: 400 });
  }

  // Validate custom coordinates if provided (must be within Argentina bounds)
  if (customLat != null && customLng != null) {
    if (customLat < -56 || customLat > -21 || customLng < -74 || customLng > -53) {
      return NextResponse.json(
        { error: "Las coordenadas están fuera de Argentina." },
        { status: 400 }
      );
    }
  }

  const radiusM = Math.min(Math.max(radiusKm, 1), 20) * 1000;

  // Step 1: Geocode (use custom coords if provided, otherwise geocode with neighborhood)
  let coords: { lat: number; lng: number } | null;

  if (customLat != null && customLng != null) {
    coords = { lat: customLat, lng: customLng };
  } else {
    const geocodeTarget = neighborhood
      ? `${neighborhood}, ${city.trim()}`
      : city.trim();
    try {
      coords = await geocode(geocodeTarget, province.trim());
    } catch (err) {
      log.error({ err: err }, "Geocode error");
      return NextResponse.json({ error: "Error al geolocalizar la ubicación." }, { status: 502 });
    }
  }

  if (!coords) {
    const target = neighborhood ? `${neighborhood}, ${city}` : city;
    return NextResponse.json(
      { error: `No se encontró "${target}, ${province}" en Argentina. Verificá el nombre.` },
      { status: 404 }
    );
  }

  const { lat, lng } = coords;

  // Step 2: Parallel searches for different keywords/types
  let searches: PromiseSettledResult<PlaceResult[]>[];
  try {
    searches = await Promise.allSettled([
      nearbySearch(lat, lng, radiusM, "polarizado"),
      nearbySearch(lat, lng, radiusM, "film automotriz"),
      nearbySearch(lat, lng, radiusM, "PPF proteccion pintura"),
      nearbySearch(lat, lng, radiusM, "tintado autos"),
      nearbySearch(lat, lng, radiusM, "autodetailing detailing"),
      nearbySearch(lat, lng, radiusM, "vidrieria"),
      nearbySearch(lat, lng, radiusM, "cristaleria vidrios"),
      nearbySearch(lat, lng, radiusM, "constructora obra"),
      nearbySearch(lat, lng, radiusM, "estudio arquitectura"),
      // Concesionarias: Text Search (finds by category, not just keyword)
      // Use only city name (not province) to avoid Google confusing province with city
      // lat/lng + radius already constrain the geographic area
      textSearch(`concesionarias de autos en ${city}`, lat, lng, radiusM),
      textSearch(`agencia de autos en ${city}`, lat, lng, radiusM),
      textSearch(`concesionario oficial en ${city}`, lat, lng, radiusM),
      textSearch(`venta de autos 0km en ${city}`, lat, lng, radiusM),
      textSearch(`automotora en ${city}`, lat, lng, radiusM),
      textSearch(`plan de ahorro autos en ${city}`, lat, lng, radiusM),
      nearbySearch(lat, lng, radiusM, "", "car_dealer"),
      // Talleres
      nearbySearch(lat, lng, radiusM, "", "car_repair"),
      nearbySearch(lat, lng, radiusM, "", "car_wash"),
    ]);
  } catch (err) {
    log.error({ err }, "Nearby search batch error");
    return NextResponse.json(
      { error: "Error al buscar negocios en Google Places. Verificá que la API 'Places API' esté habilitada en Google Cloud Console." },
      { status: 502 }
    );
  }

  // Check if all searches failed (likely API not enabled)
  const allFailed = searches.every((s) => s.status === "rejected");
  if (allFailed) {
    const firstErr = searches[0].status === "rejected" ? (searches[0].reason as Error).message : "";
    log.error({ firstErr }, "All nearby searches failed");
    return NextResponse.json(
      { error: firstErr.includes("REQUEST_DENIED")
          ? "Google Places API no está habilitada. Habilitá 'Places API' en Google Cloud Console: https://console.cloud.google.com/apis/library/places-backend.googleapis.com"
          : "Error al buscar negocios. Intentá de nuevo." },
      { status: 502 }
    );
  }

  // Deduplicate by place_id
  const seen = new Set<string>();
  const allPlaces: PlaceResult[] = [];

  for (const result of searches) {
    if (result.status === "fulfilled") {
      for (const place of result.value) {
        if (!seen.has(place.place_id)) {
          seen.add(place.place_id);
          allPlaces.push(place);
        }
      }
    }
  }

  // Fetch Place Details for each result in parallel to get phone + website
  // Process up to 120 results (batched in groups of 40 to avoid overwhelming the API)
  const topPlaces = allPlaces.slice(0, 200);
  const details: PlaceDetails[] = [];
  const BATCH_SIZE = 40;
  for (let i = 0; i < topPlaces.length; i += BATCH_SIZE) {
    const batch = topPlaces.slice(i, i + BATCH_SIZE);
    const batchDetails = await Promise.all(
      batch.map((p) => getPlaceDetails(p.place_id))
    );
    details.push(...batchDetails);
  }

  // Filter out permanently/temporarily closed businesses
  const openPlaces: { place: PlaceResult; detail: PlaceDetails }[] = [];
  for (let i = 0; i < topPlaces.length; i++) {
    const d = details[i];
    if (d.business_status === "CLOSED_PERMANENTLY" || d.business_status === "CLOSED_TEMPORARILY") {
      continue;
    }
    openPlaces.push({ place: topPlaces[i], detail: d });
  }

  const businesses = openPlaces.map(({ place: p, detail: d }) => {
    const rawPhone = d.formatted_phone_number || d.international_phone_number || "";
    const { phone, isWhatsApp } = normalizeArgPhone(rawPhone);
    const parsed = parseAddressComponents(d.address_components);

    return {
      name: p.name,
      address: parsed.street || p.vicinity || p.formatted_address || "",
      city: parsed.city || "",
      province: parsed.province || "",
      phone,
      whatsapp: isWhatsApp ? phone : "",
      website: d.website || "",
      lat: p.geometry.location.lat,
      lng: p.geometry.location.lng,
      type: inferType(p.types, p.name),
      rating: p.rating ?? 0,
      userRatingsTotal: p.user_ratings_total ?? 0,
      hasPhotos: (p.photos?.length ?? 0) > 0,
    };
  });

  // Step 3: Check against existing leads (fuzzy matching)
  const existingLeads =
    businesses.length > 0
      ? await prisma.contact.findMany({
          where: { type: "LEAD", company: { not: null } },
          select: { id: true, company: true },
        })
      : [];

  // Normalize for comparison: lowercase, remove punctuation, collapse whitespace
  function normalizeName(s: string): string {
    return s.toLowerCase().replace(/[^a-záéíóúüñ0-9\s]/gi, "").replace(/\s+/g, " ").trim();
  }

  const leadNormalized = existingLeads
    .map((l) => normalizeName(l.company ?? ""))
    .filter(Boolean);

  function isSimilar(a: string, b: string): boolean {
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    // Simple Levenshtein-like ratio for short names
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length < b.length ? a : b;
    if (longer.length === 0) return true;
    // Check starts-with for common prefix (handles "Taller X" vs "Taller X - Rosario")
    if (longer.startsWith(shorter) && shorter.length / longer.length > 0.6) return true;
    return false;
  }

  const enriched = businesses.map((b) => {
    const norm = normalizeName(b.name);
    const found = leadNormalized.some((ln) => isSimilar(norm, ln));
    return { ...b, isInLeads: found };
  });

  return NextResponse.json({ businesses: enriched, center: { lat, lng } });
}
