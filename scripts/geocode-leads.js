// Script: Geocode lead addresses using Google Geocoding API
// Normalizes state, city, neighborhood, and cleans address field
//
// Usage: node scripts/geocode-leads.js [--dry-run] [--limit N]

const { PrismaClient } = require("@prisma/client");
const https = require("https");

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!API_KEY) {
  console.error("ERROR: Set GOOGLE_MAPS_API_KEY in .env");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : 0;

const prisma = new PrismaClient();

// ── Province normalization ────────────────────────────────────────────────────
const PROVINCE_MAP = {
  "ciudad autónoma de buenos aires": "CABA",
  "ciudad autonoma de buenos aires": "CABA",
  "caba": "CABA",
  "autonomous city of buenos aires": "CABA",
  "comuna": "CABA",
  "capital federal": "CABA",
  "cf": "CABA",
  "provincia de buenos aires": "Buenos Aires",
  "buenos aires": "Buenos Aires",
  "córdoba": "Córdoba",
  "cordoba": "Córdoba",
  "santa fe": "Santa Fe",
  "mendoza": "Mendoza",
  "tucumán": "Tucumán",
  "tucuman": "Tucumán",
  "entre ríos": "Entre Ríos",
  "entre rios": "Entre Ríos",
  "misiones": "Misiones",
  "corrientes": "Corrientes",
  "santiago del estero": "Santiago del Estero",
  "san juan": "San Juan",
  "san luis": "San Luis",
  "neuquén": "Neuquén",
  "neuquen": "Neuquén",
  "río negro": "Río Negro",
  "rio negro": "Río Negro",
  "catamarca": "Catamarca",
  "formosa": "Formosa",
  "santa cruz": "Santa Cruz",
  "tierra del fuego": "Tierra del Fuego",
  "tierra del fuego, antártida e islas del atlántico sur": "Tierra del Fuego",
  "chaco": "Chaco",
  "chubut": "Chubut",
  "jujuy": "Jujuy",
  "la pampa": "La Pampa",
  "la rioja": "La Rioja",
  "salta": "Salta",
};

function normalizeProvince(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  return PROVINCE_MAP[key] || name;
}

// ── Google Geocoding ──────────────────────────────────────────────────────────
function geocode(address) {
  return new Promise((resolve, reject) => {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:AR&language=es&key=${API_KEY}`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

function extractComponents(result) {
  const components = result.address_components || [];
  const get = (type) => {
    const c = components.find((c) => c.types.includes(type));
    return c ? c.long_name : null;
  };
  const getShort = (type) => {
    const c = components.find((c) => c.types.includes(type));
    return c ? c.short_name : null;
  };

  const streetNumber = get("street_number");
  const route = get("route");
  const neighborhood = get("neighborhood") || get("sublocality_level_1") || get("sublocality");
  const locality = get("locality");
  const adminArea2 = get("administrative_area_level_2"); // partido/departamento
  const adminArea1 = get("administrative_area_level_1"); // provincia
  const postalCode = get("postal_code");

  // Build clean address (just street + number)
  let cleanAddress = null;
  if (route) {
    cleanAddress = streetNumber ? `${route} ${streetNumber}` : route;
  }

  // Determine city: for CABA use neighborhood as the "barrio" and city = null (it's CABA)
  // For Buenos Aires province, city = locality or adminArea2 (partido)
  const province = normalizeProvince(adminArea1);

  let city = null;
  let barrio = neighborhood;

  if (province === "CABA") {
    city = null; // CABA is the city itself
    barrio = neighborhood || locality;
  } else {
    city = locality || adminArea2;
    // In big cities of Buenos Aires province, keep neighborhood
    // In smaller cities, neighborhood is usually null anyway
  }

  return {
    address: cleanAddress,
    neighborhood: barrio,
    city,
    state: province,
  };
}

// ── Rate limiter (10 req/sec to stay under Google's limit) ────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  if (LIMIT) console.log(`Limit: ${LIMIT} leads`);

  // Get leads that have address data
  const query = {
    where: {
      type: "LEAD",
      OR: [
        { address: { not: null, not: "" } },
        { city: { not: null, not: "" } },
      ],
    },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      neighborhood: true,
      company: true,
    },
    orderBy: { createdAt: "desc" },
  };
  if (LIMIT) query.take = LIMIT;

  const leads = await prisma.contact.findMany(query);
  console.log(`Found ${leads.length} leads to process\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let noResult = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const progress = `[${i + 1}/${leads.length}]`;

    // Build search query from available data
    const parts = [lead.address, lead.city, lead.state].filter(Boolean);
    const searchQuery = parts.join(", ") + ", Argentina";

    if (!searchQuery.trim() || searchQuery === ", Argentina") {
      console.log(`${progress} SKIP (no address data): ${lead.company || lead.id}`);
      skipped++;
      continue;
    }

    try {
      const response = await geocode(searchQuery);

      if (response.status === "OVER_QUERY_LIMIT") {
        console.error("\n⚠ OVER_QUERY_LIMIT — stopping. Wait and retry.");
        break;
      }

      if (response.status !== "OK" || !response.results || response.results.length === 0) {
        console.log(`${progress} NO RESULT: ${lead.company || lead.id} — query: "${searchQuery}"`);
        noResult++;
        continue;
      }

      const parsed = extractComponents(response.results[0]);

      // Only update if we got something useful
      if (!parsed.state && !parsed.city && !parsed.address) {
        console.log(`${progress} NO USEFUL DATA: ${lead.company || lead.id}`);
        noResult++;
        continue;
      }

      const updateData = {};
      if (parsed.address) updateData.address = parsed.address;
      if (parsed.state) updateData.state = parsed.state;
      if (parsed.city) updateData.city = parsed.city;
      if (parsed.neighborhood) updateData.neighborhood = parsed.neighborhood;
      // If CABA and no city from Google, set city to barrio name for display
      if (parsed.state === "CABA" && !parsed.city && parsed.neighborhood) {
        updateData.city = parsed.neighborhood;
      }

      if (Object.keys(updateData).length === 0) {
        skipped++;
        continue;
      }

      const changes = Object.entries(updateData)
        .map(([k, v]) => `${k}: "${lead[k] || ""}" → "${v}"`)
        .join(" | ");
      console.log(`${progress} ${lead.company || lead.id}: ${changes}`);

      if (!DRY_RUN) {
        await prisma.contact.update({
          where: { id: lead.id },
          data: updateData,
        });
      }
      updated++;
    } catch (err) {
      console.error(`${progress} ERROR: ${lead.company || lead.id} — ${err.message}`);
      errors++;
    }

    // Rate limit: ~10 requests per second
    await sleep(100);
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Done! Updated: ${updated} | Skipped: ${skipped} | No result: ${noResult} | Errors: ${errors}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
