import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { requireRole } from "@/lib/api-auth";
import { isInsidePeru } from "@/lib/peru-geo";
import { normalizePeruPhone, normalizePeruWhatsApp } from "@/lib/peru/phone";
import { findSiteContacts } from "@/lib/peru/site-contacts";
import { getWrittenPeers, hasWhatsappConversation } from "@/lib/whatsapp/written-peers";
import {
  geocodePeru,
  getPlaceDetails,
  inferType,
  nearbySearch,
  parseAddress,
  textSearch,
  type PlaceDetails,
  type PlaceResult,
} from "@/lib/peru/places";

const log = createLogger("api/c-peru/search");

// Esta ruta hace decenas de llamadas a Google y lee los sitios de los negocios.
export const maxDuration = 300;

const MAX_PLACES = 200;
const DETAILS_BATCH = 40;
const SITE_CONCURRENCY = 12;

type SearchBody = {
  city: string;
  department: string;
  radiusKm?: number;
  neighborhood?: string;
  customLat?: number;
  customLng?: number;
};

/** Corre `fn` sobre `items` con a lo sumo `limit` en vuelo a la vez. */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function POST(request: Request) {
  const gate = await requireRole();
  if (!gate.success) return gate.response;

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_MAPS_API_KEY no configurada. Agregala en las variables de entorno." },
      { status: 500 }
    );
  }

  let body: SearchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { city, department, radiusKm = 3, neighborhood, customLat, customLng } = body;
  if (!city?.trim() || !department?.trim()) {
    return NextResponse.json({ error: "Departamento y ciudad son requeridos" }, { status: 400 });
  }
  if (customLat != null && customLng != null && !isInsidePeru(customLat, customLng)) {
    return NextResponse.json({ error: "Las coordenadas están fuera de Perú." }, { status: 400 });
  }

  const radiusM = Math.min(Math.max(Number(radiusKm) || 3, 1), 20) * 1000;

  // Paso 1: centro de la búsqueda (punto elegido en el mapa o geocodificación).
  let coords: { lat: number; lng: number } | null;
  if (customLat != null && customLng != null) {
    coords = { lat: customLat, lng: customLng };
  } else {
    const target = neighborhood ? `${neighborhood}, ${city.trim()}` : city.trim();
    try {
      coords = await geocodePeru(target, department.trim());
    } catch (err) {
      log.error({ err }, "Error al geocodificar");
      return NextResponse.json({ error: "Error al geolocalizar la ubicación." }, { status: 502 });
    }
    if (!coords) {
      return NextResponse.json(
        { error: `No se encontró "${target}, ${department}" en Perú. Verificá el nombre.` },
        { status: 404 }
      );
    }
  }
  const { lat, lng } = coords;

  // Paso 2: búsquedas en paralelo. Los términos son los del mercado peruano:
  // "lunas polarizadas" y "laminado de lunas" en vez de "polarizado" a secas.
  const cityName = city.trim();
  const searches = await Promise.allSettled([
    nearbySearch(lat, lng, radiusM, "lunas polarizadas"),
    nearbySearch(lat, lng, radiusM, "polarizado vehicular"),
    nearbySearch(lat, lng, radiusM, "laminado de lunas film automotriz"),
    nearbySearch(lat, lng, radiusM, "PPF protección pintura"),
    nearbySearch(lat, lng, radiusM, "autodetailing detailing"),
    nearbySearch(lat, lng, radiusM, "vidriería"),
    nearbySearch(lat, lng, radiusM, "cristalería vidrios templados"),
    nearbySearch(lat, lng, radiusM, "constructora"),
    nearbySearch(lat, lng, radiusM, "estudio de arquitectura"),
    textSearch(`concesionarias de autos en ${cityName}`, lat, lng, radiusM),
    textSearch(`venta de autos nuevos en ${cityName}`, lat, lng, radiusM),
    textSearch(`concesionario oficial en ${cityName}`, lat, lng, radiusM),
    textSearch(`automotriz en ${cityName}`, lat, lng, radiusM),
    nearbySearch(lat, lng, radiusM, "", "car_dealer"),
    nearbySearch(lat, lng, radiusM, "", "car_repair"),
    nearbySearch(lat, lng, radiusM, "", "car_wash"),
  ]);

  if (searches.every((s) => s.status === "rejected")) {
    const firstErr = searches[0].status === "rejected" ? (searches[0].reason as Error).message : "";
    log.error({ firstErr }, "Todas las búsquedas fallaron");
    return NextResponse.json(
      { error: firstErr || "Error al buscar negocios en Google Places. Verificá la API Key en Google Cloud Console." },
      { status: 502 }
    );
  }

  // Deduplicar por place_id.
  const seen = new Set<string>();
  const places: PlaceResult[] = [];
  for (const result of searches) {
    if (result.status !== "fulfilled") continue;
    for (const place of result.value) {
      if (seen.has(place.place_id)) continue;
      seen.add(place.place_id);
      places.push(place);
    }
  }

  // Paso 3: teléfono, web y dirección de cada local.
  const top = places.slice(0, MAX_PLACES);
  const details: PlaceDetails[] = [];
  for (let i = 0; i < top.length; i += DETAILS_BATCH) {
    const batch = top.slice(i, i + DETAILS_BATCH);
    details.push(...(await Promise.all(batch.map((p) => getPlaceDetails(p.place_id)))));
  }

  const open = top
    .map((place, i) => ({ place, detail: details[i] }))
    .filter(({ detail }) => detail.business_status !== "CLOSED_PERMANENTLY" && detail.business_status !== "CLOSED_TEMPORARILY");

  // Paso 4: correo (y WhatsApp) desde el sitio web, solo de los que tienen sitio.
  const site = await mapWithLimit(open, SITE_CONCURRENCY, ({ detail }) =>
    detail.website ? findSiteContacts(detail.website) : Promise.resolve({ email: "", whatsapp: "" })
  );

  const businesses = open.map(({ place: p, detail: d }, i) => {
    const parsed = parseAddress(d.address_components);
    const phone = normalizePeruPhone(d.international_phone_number || d.formatted_phone_number);
    // El celular del listado de Google manda; el WhatsApp del sitio web completa
    // a los negocios que solo publican un fijo.
    const whatsapp = phone.whatsapp || normalizePeruWhatsApp(site[i].whatsapp);
    return {
      placeId: p.place_id,
      name: p.name,
      address: parsed.street || p.vicinity || p.formatted_address || "",
      district: parsed.district,
      city: parsed.city,
      department: parsed.department,
      phone: phone.phone,
      phoneType: phone.type,
      whatsapp,
      email: site[i].email,
      website: d.website || "",
      lat: p.geometry.location.lat,
      lng: p.geometry.location.lng,
      type: inferType(p.types, p.name),
      rating: p.rating ?? 0,
      userRatingsTotal: p.user_ratings_total ?? 0,
    };
  });

  // Paso 5: marcar los que ya están guardados en Contactos Perú.
  const saved = businesses.length
    ? await prisma.peruContact.findMany({
        where: {
          OR: [
            { placeId: { in: businesses.map((b) => b.placeId) } },
            { phone: { in: businesses.map((b) => b.phone).filter(Boolean) } },
          ],
        },
        select: { placeId: true, phone: true },
      })
    : [];
  const savedPlaceIds = new Set(saved.map((s) => s.placeId).filter(Boolean));
  const savedPhones = new Set(saved.map((s) => s.phone).filter(Boolean));

  // Paso 6: marcar a los que ya tienen mensajes de WhatsApp, estén o no guardados (se les
  // puede escribir desde esta misma lista sin guardarlos antes). Si falla la consulta no
  // se pierde la búsqueda, que tardó minutos: solo no se marca a nadie.
  const written = await getWrittenPeers().catch((err) => {
    log.warn({ err }, "No se pudo consultar con quién ya hubo mensajes de WhatsApp");
    return new Set<string>();
  });

  const enriched = businesses.map((b) => ({
    ...b,
    isSaved: savedPlaceIds.has(b.placeId) || (!!b.phone && savedPhones.has(b.phone)),
    whatsappWritten: hasWhatsappConversation(b.whatsapp, written),
  }));

  return NextResponse.json({ businesses: enriched, center: { lat, lng } });
}
