import { randomBytes } from "crypto";

/**
 * La URL pública del logo de un taller.
 *
 * Vive acá y no repartida por las rutas porque la arman tres lugares —la config
 * del taller, el estado público de la garantía y el mail de activación— y si se
 * despegan entre sí el logo desaparece de alguno sin que nadie se entere: un
 * `<img>` roto en un mail no tira ningún error.
 *
 * Devuelve una ruta **relativa al CRM**. Quien la use en un contexto que no es
 * el CRM (el mail, kristall-web) tiene que anteponerle la base del CRM.
 */
export function workshopLogoPath(logoSlug: string): string {
  return `/api/public/workshop/logo/${logoSlug}`;
}

/**
 * Genera el slug con el que se sirve el logo.
 *
 * Aleatorio y no derivado del `contactId`: esta clave viaja en mails y en HTML
 * público, así que no puede ser —ni permitir deducir— un identificador del
 * sistema. Ver la nota larga en la ruta que lo sirve.
 */
export function newLogoSlug(): string {
  return randomBytes(16).toString("hex");
}
