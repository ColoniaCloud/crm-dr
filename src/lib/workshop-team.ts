import { randomBytes } from "crypto";

/**
 * La URL pública de la foto del equipo de un taller.
 *
 * Mismo criterio que `workshop-hero.ts` y `workshop-logo.ts`: vive acá y no
 * repartida por las rutas porque la arman más de un lugar, y si se despegan
 * entre sí la foto desaparece sin que nadie se entere.
 *
 * Devuelve una ruta **relativa al CRM**. Quien la use desde afuera
 * (kristall-web, polarizar) tiene que anteponerle la base del CRM.
 */
export function workshopTeamPath(teamSlug: string): string {
  return `/api/public/workshop/team/${teamSlug}`;
}

/**
 * Genera el slug con el que se sirve la foto del equipo.
 *
 * Aleatorio, propio, y no derivado del `contactId` — ver la nota larga en
 * `workshop-logo.ts`. Propio y no compartido con el hero por la misma razón
 * de siempre: borrar una foto no tiene que romper la URL de la otra.
 */
export function newTeamSlug(): string {
  return randomBytes(16).toString("hex");
}
