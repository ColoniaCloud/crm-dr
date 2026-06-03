import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { AR_PROVINCES, AR_CITIES } from "@/lib/argentina-geo";

const log = createLogger("api/admin/normalize-leads");

// ── Province matching ────────────────────────────────────────────────────────
const PROVINCE_ALIASES: Record<string, string> = {
  "caba": "CABA",
  "capital federal": "CABA",
  "c.a.b.a.": "CABA",
  "c.a.b.a": "CABA",
  "ciudad autonoma de buenos aires": "CABA",
  "ciudad autónoma de buenos aires": "CABA",
  "cdad. autónoma de buenos aires": "CABA",
  "buenos aires": "Buenos Aires",
  "bs as": "Buenos Aires",
  "bs. as.": "Buenos Aires",
  "bsas": "Buenos Aires",
  "cordoba": "Córdoba",
  "córdoba": "Córdoba",
  "entre rios": "Entre Ríos",
  "entre ríos": "Entre Ríos",
  "neuquen": "Neuquén",
  "neuquén": "Neuquén",
  "rio negro": "Río Negro",
  "río negro": "Río Negro",
  "tucuman": "Tucumán",
  "tucumán": "Tucumán",
  "tierra del fuego": "Tierra del Fuego",
};

function matchProvince(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  // Direct match
  const exact = AR_PROVINCES.find((p) => p.toLowerCase() === lower);
  if (exact) return exact;

  // Alias match
  if (PROVINCE_ALIASES[lower]) return PROVINCE_ALIASES[lower];

  // Partial match
  const partial = AR_PROVINCES.find((p) => p.toLowerCase().includes(lower) || lower.includes(p.toLowerCase()));
  return partial || null;
}

function matchCity(raw: string, province: string): string | null {
  if (!raw || !province) return null;
  const cities = AR_CITIES[province];
  if (!cities) return null;
  const lower = raw.trim().toLowerCase();

  const exact = cities.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;

  const partial = cities.find(
    (c) => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase())
  );
  return partial || null;
}

// ── Address parsing ──────────────────────────────────────────────────────────
/**
 * Try to extract city and province from address strings like:
 *   "Av. San Martín 1234, Rosario, Santa Fe"
 *   "Calle 123, Córdoba, Córdoba, Argentina"
 */
function parseAddressField(address: string): {
  cleanAddress: string;
  city: string | null;
  province: string | null;
} {
  if (!address) return { cleanAddress: "", city: null, province: null };

  // Remove "Argentina" suffix
  let cleaned = address.replace(/,?\s*Argentina\s*$/i, "").trim();

  // Split by commas
  const parts = cleaned.split(",").map((p) => p.trim()).filter(Boolean);

  if (parts.length < 2) return { cleanAddress: cleaned, city: null, province: null };

  // Try last part as province
  let province: string | null = null;
  let city: string | null = null;
  let addressParts = [...parts];

  // Check last part for province
  const lastPart = parts[parts.length - 1];
  province = matchProvince(lastPart);
  if (province) {
    addressParts = parts.slice(0, -1);
  }

  // Check second-to-last (or last if no province found) for city
  if (addressParts.length >= 2) {
    const cityCandidate = addressParts[addressParts.length - 1];
    if (province) {
      city = matchCity(cityCandidate, province);
    }
    if (!city) {
      // Try matching against all provinces' cities
      for (const prov of AR_PROVINCES) {
        city = matchCity(cityCandidate, prov);
        if (city) {
          if (!province) province = prov;
          break;
        }
      }
    }
    if (city) {
      addressParts = addressParts.slice(0, -1);
    }
  }

  return {
    cleanAddress: addressParts.join(", ").trim(),
    city,
    province,
  };
}

// ── Phone normalization ──────────────────────────────────────────────────────
function normalizePhone(raw: string): string {
  if (!raw) return "";
  // Remove non-phone chars but keep +, digits, spaces, hyphens for readability
  let phone = raw.trim();
  // Remove leading/trailing whitespace and fix common issues
  phone = phone.replace(/\s+/g, " ").trim();
  return phone;
}

function isLikelyMobile(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  // Argentine mobile: has 9 after country code, or starts with 15, or 11-digit local
  return digits.includes("549") ||
    phone.includes("15 ") || phone.includes("15-") || phone.startsWith("15") ||
    (digits.length >= 10 && !digits.startsWith("5411") && digits.startsWith("54"));
}

// ── Email validation ─────────────────────────────────────────────────────────
function isValidEmail(email: string): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function cleanEmail(email: string): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  if (!isValidEmail(trimmed)) return null;
  return trimmed;
}

// ── Website validation ───────────────────────────────────────────────────────
function cleanWebsite(raw: string): string | null {
  if (!raw) return null;
  let url = raw.trim();
  // Remove leading/trailing quotes/spaces
  url = url.replace(/^["']+|["']+$/g, "").trim();
  if (!url) return null;
  // Basic URL pattern check
  if (!/^https?:\/\//i.test(url) && /\.\w{2,}/.test(url)) {
    url = "https://" + url;
  }
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

// ── Main endpoint ────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let dryRun = true;
  try {
    const body = await request.json().catch(() => ({}));
    dryRun = body.dryRun !== false; // Default to dry run for safety
  } catch {
    // default dry run
  }

  try {
    const leads = await prisma.contact.findMany({
      where: { type: "LEAD" },
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        phone: true,
        whatsapp: true,
        email: true,
        website: true,
        notes: true,
      },
    });

    const changes: Array<{
      id: string;
      field: string;
      from: string | null;
      to: string | null;
    }> = [];

    const updates: Array<{
      id: string;
      data: Record<string, string | null>;
    }> = [];

    for (const lead of leads) {
      const update: Record<string, string | null> = {};

      // 1. Parse address to extract city/province if missing
      if (lead.address && (!lead.city || !lead.state)) {
        const parsed = parseAddressField(lead.address);
        if (parsed.city && !lead.city) {
          update.city = parsed.city;
          changes.push({ id: lead.id, field: "city", from: lead.city, to: parsed.city });
        }
        if (parsed.province && !lead.state) {
          update.state = parsed.province;
          changes.push({ id: lead.id, field: "state", from: lead.state, to: parsed.province });
        }
        if (parsed.cleanAddress && parsed.cleanAddress !== lead.address && (parsed.city || parsed.province)) {
          update.address = parsed.cleanAddress;
          changes.push({ id: lead.id, field: "address", from: lead.address, to: parsed.cleanAddress });
        }
      }

      // 2. Match province to canonical name
      if (lead.state && !update.state) {
        const matched = matchProvince(lead.state);
        if (matched && matched !== lead.state) {
          update.state = matched;
          changes.push({ id: lead.id, field: "state", from: lead.state, to: matched });
        }
      }

      // 3. Match city to canonical name
      const effectiveProvince = update.state || lead.state;
      if (lead.city && effectiveProvince && !update.city) {
        const matched = matchCity(lead.city, effectiveProvince);
        if (matched && matched !== lead.city) {
          update.city = matched;
          changes.push({ id: lead.id, field: "city", from: lead.city, to: matched });
        }
      }

      // 4. Normalize phone
      if (lead.phone) {
        const normalized = normalizePhone(lead.phone);
        if (normalized !== lead.phone) {
          update.phone = normalized;
          changes.push({ id: lead.id, field: "phone", from: lead.phone, to: normalized });
        }
        // If no whatsapp and phone looks mobile, copy to whatsapp
        if (!lead.whatsapp && isLikelyMobile(lead.phone)) {
          update.whatsapp = normalized || lead.phone;
          changes.push({ id: lead.id, field: "whatsapp", from: null, to: update.whatsapp });
        }
      }

      // 5. Validate/clean email
      if (lead.email) {
        const cleaned = cleanEmail(lead.email);
        if (cleaned !== lead.email) {
          update.email = cleaned;
          changes.push({ id: lead.id, field: "email", from: lead.email, to: cleaned });
        }
      }

      // 6. Extract website from notes if not set
      if (!lead.website && lead.notes) {
        const urlMatch = lead.notes.match(/Web:\s*(https?:\/\/\S+|\S+\.\S+)/i);
        if (urlMatch) {
          const cleaned = cleanWebsite(urlMatch[1]);
          if (cleaned) {
            update.website = cleaned;
            changes.push({ id: lead.id, field: "website", from: null, to: cleaned });
          }
        }
      }

      // 7. Clean existing website
      if (lead.website) {
        const cleaned = cleanWebsite(lead.website);
        if (cleaned !== lead.website) {
          update.website = cleaned;
          changes.push({ id: lead.id, field: "website", from: lead.website, to: cleaned });
        }
      }

      if (Object.keys(update).length > 0) {
        updates.push({ id: lead.id, data: update });
      }
    }

    if (!dryRun) {
      let applied = 0;
      for (const u of updates) {
        await prisma.contact.update({
          where: { id: u.id },
          data: u.data,
        });
        applied++;
      }

      log.info(`Normalized ${applied} leads with ${changes.length} total changes`);
      return NextResponse.json({
        ok: true,
        mode: "applied",
        leadsUpdated: applied,
        totalChanges: changes.length,
        changes: changes.slice(0, 200), // Limit response size
      });
    }

    return NextResponse.json({
      ok: true,
      mode: "dry-run",
      leadsToUpdate: updates.length,
      totalChanges: changes.length,
      totalLeads: leads.length,
      changes: changes.slice(0, 200),
    });
  } catch (error) {
    log.error({ err: error }, "Error normalizing leads");
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Error al normalizar leads", details: detail }, { status: 500 });
  }
}
