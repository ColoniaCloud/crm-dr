import { randomBytes } from "crypto";

/**
 * La URL pública del hero de un taller.
 *
 * Mismo criterio que `workshop-logo.ts`: vive acá y no repartida por las
 * rutas porque la arman más de un lugar (la config del taller y la página
 * pública), y si se despegan entre sí el hero desaparece sin que nadie se
 * entere.
 *
 * Devuelve una ruta **relativa al CRM**. Quien la use en un contexto que no es
 * el CRM (kristall-web, polarizar) tiene que anteponerle la base del CRM.
 */
export function workshopHeroPath(heroSlug: string): string {
  return `/api/public/workshop/hero/${heroSlug}`;
}

/**
 * Genera el slug con el que se sirve el hero.
 *
 * Aleatorio y no derivado del `contactId`, ni compartido con `logoSlug`: un
 * taller puede tener hero sin logo o viceversa, y compartir la clave haría
 * que borrar uno rompiera la URL pública del otro. Ver la nota larga en
 * `workshop-logo.ts` sobre por qué es aleatorio y no un identificador del
 * sistema.
 */
export function newHeroSlug(): string {
  return randomBytes(16).toString("hex");
}
