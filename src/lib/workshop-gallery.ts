import { randomBytes } from "crypto";

/**
 * La URL pública de una foto del álbum. Mismo criterio que
 * `workshop-logo.ts`/`workshop-hero.ts`: ruta **relativa al CRM**, y quien la
 * use fuera del CRM tiene que anteponerle su base.
 *
 * Lleva el slug del taller **y** el id de la foto: el slug identifica el
 * álbum (no hace falta uno por foto), y el id distingue cuál de las hasta 12
 * fotos es. La ruta de servicio (`.../gallery/[slug]/[photoId]/route.ts`)
 * igual revalida que esa foto sea de ese mismo taller antes de servirla.
 */
export function workshopGalleryPhotoPath(gallerySlug: string, photoId: string): string {
  return `/api/public/workshop/gallery/${gallerySlug}/${photoId}`;
}

/**
 * Genera el slug con el que se sirve el álbum completo.
 *
 * Aleatorio y propio — no reusa `logoSlug` ni `heroSlug`: un taller puede
 * tener álbum sin logo ni hero, y compartir la clave haría que borrar una
 * imagen rompiera la URL pública de otra. Ver la nota larga en
 * `workshop-logo.ts` sobre por qué es aleatorio y no un identificador del
 * sistema.
 */
export function newGallerySlug(): string {
  return randomBytes(16).toString("hex");
}
