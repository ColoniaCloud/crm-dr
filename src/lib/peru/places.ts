/**
 * Llamadas a Google Places / Geocoding acotadas a Perú. Es la contraparte de lo
 * que hace src/app/api/scrapper/search/route.ts para Argentina: se duplica a
 * propósito para no tocar el buscador que ya está en producción.
 */
import { createLogger } from "@/lib/logger";
import { matchPeruDepartment } from "@/lib/peru-geo";

const log = createLogger("peru/places");
const MAPS_KEY = () => process.env.GOOGLE_MAPS_API_KEY ?? "";

export type PlaceResult = {
  place_id: string;
  name: string;
  vicinity?: string;
  formatted_address?: string;
  geometry: { location: { lat: number; lng: number } };
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
};

type AddressComponent = { long_name: string; short_name: string; types: string[] };

export type PlaceDetails = {
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  formatted_address?: string;
  address_components?: AddressComponent[];
  business_status?: string;
};

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    url.searchParams.set("place_id", placeId);
    url.searchParams.set(
      "fields",
      "formatted_phone_number,international_phone_number,website,formatted_address,address_components,business_status"
    );
    url.searchParams.set("language", "es");
    url.searchParams.set("key", MAPS_KEY());
    const res = await fetch(url.toString());
    const data = await res.json();
    return (data.result ?? {}) as PlaceDetails;
  } catch {
    return {};
  }
}

/** Dirección, distrito, ciudad y departamento a partir de address_components. */
export function parseAddress(components?: AddressComponent[]): {
  street: string;
  district: string;
  city: string;
  department: string;
} {
  if (!components) return { street: "", district: "", city: "", department: "" };

  let streetNumber = "";
  let route = "";
  let district = "";
  let city = "";
  let department = "";

  for (const c of components) {
    if (c.types.includes("street_number")) streetNumber = c.long_name;
    else if (c.types.includes("route")) route = c.long_name;
    // En Perú el distrito es la unidad urbana real (Miraflores, Cayma...).
    else if (c.types.includes("locality") || c.types.includes("administrative_area_level_3")) {
      if (!district) district = c.long_name;
    } else if (c.types.includes("administrative_area_level_2")) {
      if (!city) city = c.long_name; // provincia
    } else if (c.types.includes("administrative_area_level_1")) department = c.long_name;
  }

  const street = [route, streetNumber].filter(Boolean).join(" ").trim();
  return { street, district, city: city || district, department: matchPeruDepartment(department) || department };
}

async function geocodeNominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${query}, Perú`);
    url.searchParams.set("format", "json");
    url.searchParams.set("countrycodes", "pe");
    url.searchParams.set("limit", "1");
    url.searchParams.set("accept-language", "es");
    const res = await fetch(url.toString(), { headers: { "User-Agent": "KristallCRM/1.0" } });
    const data = await res.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch {
    return null;
  }
}

type GoogleGeocodeResult = { types: string[]; geometry: { location: { lat: number; lng: number } } };

/** Geocodifica "distrito, ciudad, departamento" dentro de Perú; Google primero, OSM de respaldo. */
export async function geocodePeru(target: string, department: string): Promise<{ lat: number; lng: number } | null> {
  const query = `${target}, ${department}, Perú`;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("components", "country:PE");
    url.searchParams.set("language", "es");
    url.searchParams.set("region", "pe");
    url.searchParams.set("key", MAPS_KEY());
    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.status === "OK" && data.results?.length) {
      const results = data.results as GoogleGeocodeResult[];
      const best =
        results.find((r) => r.types.includes("locality") || r.types.includes("sublocality") || r.types.includes("administrative_area_level_3")) ??
        results.find((r) => !r.types.includes("route")) ??
        results[0];
      return best.geometry.location;
    }
    log.warn({ query, status: data.status }, "Google geocode falló, probando Nominatim");
  } catch (err) {
    log.warn({ err, query }, "Google geocode con error, probando Nominatim");
  }
  return geocodeNominatim(`${target}, ${department}`);
}

async function followPages(token: string | undefined, endpoint: string, maxPages: number): Promise<PlaceResult[]> {
  let results: PlaceResult[] = [];
  let nextToken = token;
  for (let page = 0; page < maxPages && nextToken; page++) {
    // Google tarda en activar el token de la página siguiente.
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

async function runSearch(url: URL, endpoint: string): Promise<PlaceResult[]> {
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.status === "REQUEST_DENIED") {
    throw new Error(`Google Places API no habilitada: ${data.error_message || "REQUEST_DENIED"}`);
  }
  const first = (data.results ?? []) as PlaceResult[];
  const extra = await followPages(data.next_page_token, endpoint, 2);
  return first.concat(extra);
}

const NEARBY = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const TEXT = "https://maps.googleapis.com/maps/api/place/textsearch/json";

export function nearbySearch(lat: number, lng: number, radiusM: number, keyword: string, type?: string) {
  const url = new URL(NEARBY);
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(radiusM));
  url.searchParams.set("language", "es");
  url.searchParams.set("key", MAPS_KEY());
  if (keyword) url.searchParams.set("keyword", keyword);
  if (type) url.searchParams.set("type", type);
  return runSearch(url, NEARBY);
}

export function textSearch(query: string, lat: number, lng: number, radiusM: number) {
  const url = new URL(TEXT);
  url.searchParams.set("query", query);
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(radiusM));
  url.searchParams.set("language", "es");
  url.searchParams.set("region", "pe");
  url.searchParams.set("key", MAPS_KEY());
  return runSearch(url, TEXT);
}

// Marcas que aparecen en el nombre de concesionarios peruanos.
const CAR_BRANDS = [
  "toyota", "ford", "kia", "hyundai", "nissan", "chevrolet", "suzuki", "mitsubishi", "mazda",
  "honda", "volkswagen", "renault", "peugeot", "citroen", "citroën", "fiat", "jeep", "subaru",
  "bmw", "mercedes", "audi", "volvo", "lexus", "porsche", "chery", "geely", "haval", "great wall",
  "byd", "jac", "changan", "dfsk", "maxus", "foton", "jetour", "omoda", "mg", "gac", "baic",
  "hino", "isuzu", "scania", "iveco",
];

// Con límites de palabra: "jac" no debe aparecer dentro de "Jacinto".
const CAR_BRAND_RE = new RegExp(String.raw`\b(${CAR_BRANDS.join("|")})\b`, "i");

export const PE_BUSINESS_TYPES = [
  "Talleres/Autodetailing",
  "Vidriería/Glass",
  "Arquitectura",
  "Concesionarias",
] as const;

export type PeBusinessType = (typeof PE_BUSINESS_TYPES)[number];

export function inferType(types: string[] = [], name: string): PeBusinessType {
  const n = name.toLowerCase();
  if (
    types.includes("car_dealer") ||
    n.includes("concesionari") ||
    n.includes("automotriz") ||
    n.includes("automotores") ||
    n.includes("motors") ||
    n.includes("0km") ||
    n.includes("0 km") ||
    n.includes("seminuevos") ||
    n.includes("dealer") ||
    CAR_BRAND_RE.test(n)
  )
    return "Concesionarias";
  if (n.includes("vidrier") || n.includes("glass") || n.includes("vidrio") || n.includes("cristaler") || n.includes("aluminio")) return "Vidriería/Glass";
  if (n.includes("arquitect") || n.includes("construct") || n.includes("ingenier") || n.includes("inmobiliar") || n.includes("estudio")) return "Arquitectura";
  return "Talleres/Autodetailing";
}
