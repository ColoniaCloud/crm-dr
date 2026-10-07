import { z } from "zod";
import type { BuildingUse, FilmSide, GlassType } from "@prisma/client";

/**
 * Los datos de una obra: lo que en arquitectura ocupa el lugar que en
 * automotriz ocupan el tipo de vehículo y la patente.
 *
 * Viven en `WarrantyInstallation` y en `WorkshopAsset` con los mismos nombres,
 * y **solo se guardan cuando el producto del rollo es ARCHITECTURAL** — el
 * producto decide qué campos aplican, nunca el body. Ver
 * GARANTIAS-ARQUITECTURA.md en la raíz de POLARIZADOS.
 *
 * El espejo de las etiquetas es `kristall-web/lib/obra.ts`.
 */

export const GLASS_TYPES = ["SIMPLE", "DVH", "LAMINADO", "TEMPLADO", "OTRO"] as const satisfies readonly GlassType[];
export const FILM_SIDES = ["INTERIOR", "EXTERIOR"] as const satisfies readonly FilmSide[];
export const BUILDING_USES = ["RESIDENTIAL", "COMMERCIAL"] as const satisfies readonly BuildingUse[];

export const GLASS_TYPE_LABELS: Record<GlassType, string> = {
  SIMPLE: "Vidrio simple",
  DVH: "DVH (doble vidriado)",
  LAMINADO: "Laminado",
  TEMPLADO: "Templado",
  OTRO: "Otro",
};
export const FILM_SIDE_LABELS: Record<FilmSide, string> = { INTERIOR: "Interior", EXTERIOR: "Exterior" };
export const BUILDING_USE_LABELS: Record<BuildingUse, string> = { RESIDENTIAL: "Residencial", COMMERCIAL: "Comercial" };

/**
 * Validación del body, la misma en el alta de instalación del portal, en el
 * activo de Mi Taller y en la activación pública. Todo opcional y anulable:
 * una garantía se sigue pudiendo generar sin ningún dato de obra.
 */
export const datosObraSchema = z.object({
  siteAddress: z.string().trim().max(191).nullish(), // varchar(191) en MySQL
  areaM2: z.coerce.number().positive().max(100_000).nullish(),
  paneCount: z.coerce.number().int().positive().max(10_000).nullish(),
  glassType: z.enum(GLASS_TYPES).nullish(),
  filmSide: z.enum(FILM_SIDES).nullish(),
  buildingUse: z.enum(BUILDING_USES).nullish(),
});

export type DatosObra = z.infer<typeof datosObraSchema>;

/** Las columnas tal como van a Prisma. */
export interface ColumnasObra {
  siteAddress: string | null;
  areaM2: number | null;
  paneCount: number | null;
  glassType: GlassType | null;
  filmSide: FilmSide | null;
  buildingUse: BuildingUse | null;
}

export const OBRA_VACIA: ColumnasObra = {
  siteAddress: null,
  areaM2: null,
  paneCount: null,
  glassType: null,
  filmSide: null,
  buildingUse: null,
};

/**
 * Lo que se guarda según el rubro. Fuera de arquitectura todo va en null: una
 * instalación de auto con una dirección de obra colgada sería una ficha que se
 * contradice, igual que una de arquitectura con patente.
 */
export function columnasObra(datos: DatosObra | null | undefined, esArquitectura: boolean): ColumnasObra {
  if (!esArquitectura || !datos) return OBRA_VACIA;
  return {
    siteAddress: datos.siteAddress?.trim() || null,
    areaM2: datos.areaM2 ?? null,
    paneCount: datos.paneCount ?? null,
    glassType: datos.glassType ?? null,
    filmSide: datos.filmSide ?? null,
    buildingUse: datos.buildingUse ?? null,
  };
}

/** Prisma devuelve `Decimal`; afuera del CRM viaja como número. */
export function numeroOnull(v: { toNumber(): number } | number | null | undefined): number | null {
  if (v == null) return null;
  return typeof v === "number" ? v : v.toNumber();
}

/** «12,5 m² · 6 paños», o null si no hay ninguno de los dos. */
export function describirSuperficie(areaM2: number | null, paneCount: number | null): string | null {
  const partes: string[] = [];
  if (areaM2 != null) partes.push(`${areaM2.toLocaleString("es-AR", { maximumFractionDigits: 2 })} m²`);
  if (paneCount != null) partes.push(`${paneCount} ${paneCount === 1 ? "paño" : "paños"}`);
  return partes.length ? partes.join(" · ") : null;
}

/**
 * La dirección sin lo que ubica la puerta: altura, piso, departamento, código
 * postal. «Av. Siempreviva 742 3°B, Springfield» queda «Av. Siempreviva,
 * Springfield».
 *
 * Es lo que sale por la API pública de garantías, que tiene CORS y se puede
 * leer desde cualquier navegador con el link. Ahí ya sale la patente, que el
 * taller precargó para que el cliente confirme su trabajo; una dirección
 * particular es más sensible, y para reconocer «sí, es mi casa» alcanza con la
 * calle y la localidad. La completa queda para el taller, el CRM y el
 * certificado que le llega por mail al titular.
 */
export function recortarDireccion(direccion: string | null | undefined): string | null {
  if (!direccion?.trim()) return null;
  // Palabras que anuncian un número de puerta o de unidad: se van con lo que
  // sigue, aunque no tenga dígitos («dpto B», «torre Norte»).
  const anuncia = /^(n[°ºo]?\.?|nro\.?|num(ero)?\.?|piso|dpto\.?|depto\.?|dto\.?|departamento|unidad|uf|of\.?|oficina|lote|mz\.?|manzana|torre|block|km\.?|cp|c\.p\.)$/i;
  const segmentos = direccion
    .split(",")
    .map((seg) => {
      const quedan: string[] = [];
      let saltearSiguiente = false;
      for (const palabra of seg.trim().split(/\s+/)) {
        if (anuncia.test(palabra)) {
          saltearSiguiente = true;
          continue;
        }
        if (saltearSiguiente) {
          saltearSiguiente = false;
          continue;
        }
        if (!/\d/.test(palabra)) quedan.push(palabra);
      }
      return quedan.join(" ");
    })
    .filter(Boolean);
  return segmentos.length ? segmentos.join(", ") : null;
}
