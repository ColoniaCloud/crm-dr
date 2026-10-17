import { AR_PROVINCES, UY_DEPARTMENTS } from "@/lib/argentina-geo";

/**
 * Zonas de los leads, normalizadas (decisión L3 de AGENTES.md).
 *
 * La provincia está cargada de muchas formas: el scrapper escribe "Provincia de
 * Buenos Aires", a mano se carga "Buenos Aires" o "Bs As", y CABA aparece como
 * "Capital Federal", "Ciudad Autónoma de Buenos Aires" o directamente como
 * provincia "Buenos Aires" con ciudad "CABA". Para repartir por zona hay que
 * llevar todo a una clave única antes de comparar.
 *
 * La clave es el nombre sin tildes, en minúsculas y sin "provincia de".
 */

const CABA_ALIASES = new Set([
  "caba",
  "c a b a",
  "capital federal",
  "capital",
  "ciudad autonoma de buenos aires",
  "ciudad de buenos aires",
  "cdad autonoma de buenos aires",
  "cdad de buenos aires",
]);

const ALIASES: Record<string, string> = {
  "bs as": "buenos aires",
  "bsas": "buenos aires",
  "pba": "buenos aires",
  "gba": "buenos aires",
  "tierra del fuego antartida e islas del atlantico sur": "tierra del fuego",
  "santiago del estero": "santiago del estero",
};

function clean(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave de zona de un lead, a partir de su provincia y su ciudad. Null si no hay datos. */
export function zoneKey(state: string | null | undefined, city?: string | null): string | null {
  const ciudad = city ? clean(city) : "";
  if (CABA_ALIASES.has(ciudad)) return "caba";
  if (!state?.trim()) return null;
  let p = clean(state).replace(/^(provincia|pcia|prov)( de)? /, "");
  if (CABA_ALIASES.has(p)) return "caba";
  p = ALIASES[p] ?? p;
  return p || null;
}

export interface ZoneOption {
  key: string;
  label: string;
  country: "AR" | "UY";
}

/**
 * Las zonas que se pueden asignar a un vendedor: provincias argentinas y
 * departamentos de Uruguay. El lead no guarda el país, así que un nombre que
 * existe en los dos (Río Negro) es una sola zona.
 */
export const ZONE_OPTIONS: ZoneOption[] = (() => {
  const ar = AR_PROVINCES.map((label) => ({ key: zoneKey(label)!, label, country: "AR" as const }));
  const enAr = new Set(ar.map((z) => z.key));
  const uy = UY_DEPARTMENTS.map((label) => ({ key: zoneKey(label)!, label: `${label} (UY)`, country: "UY" as const }));
  for (const z of ar) if (uy.some((u) => u.key === z.key)) z.label = `${z.label} (AR/UY)`;
  return [...ar, ...uy.filter((z) => !enAr.has(z.key))];
})();

const LABELS = new Map(ZONE_OPTIONS.map((z) => [z.key, z.label]));

export function zoneLabel(key: string | null): string {
  if (!key) return "Sin zona";
  return LABELS.get(key) ?? key.replace(/\b\w/g, (c) => c.toUpperCase());
}
