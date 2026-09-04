/**
 * Los tipos de vehiculo que puede elegir el instalador o el cliente final.
 *
 * La lista sale de los iconos que hay en `public/iconos/vehiculos` de
 * kristall-web y polarizar: cada slug de aca tiene que tener su SVG de los dos
 * lados, porque los desplegables se dibujan con esos iconos. **Si agregas uno,
 * agregalo en los tres lados** — sin icono el desplegable muestra un hueco, y
 * sin slug aca el endpoint rechaza la eleccion.
 *
 * Se guarda el slug y no el nombre: el nombre visible puede cambiar sin tocar
 * lo que ya esta guardado en la base.
 */
export const VEHICLE_TYPES = [
  "SEDAN",
  "HATCHBACK",
  "SUV",
  "PICKUP",
  "FURGON",
  "VAN_MINIBUS",
  "CAMION",
  "COLECTIVO",
  "EMBARCACION",
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];

/**
 * Slugs que ya no se ofrecen pero pueden estar guardados.
 *
 * `CAMION_CHICO`/`CAMION_GRANDE` y `YATE_CHICO`/`YATE_GRANDE` se unificaron: la
 * distincion no le servia a nadie y obligaba a elegir entre dos dibujos casi
 * iguales. **Las filas viejas no se reescriben**, asi que hay que poder
 * traducirlas al mostrarlas — si no, una garantia de hace un mes mostraria
 * "CAMION_GRANDE" crudo.
 */
export const VEHICLE_TYPES_LEGACY: Record<string, VehicleType> = {
  CAMION_CHICO: "CAMION",
  CAMION_GRANDE: "CAMION",
  YATE_CHICO: "EMBARCACION",
  YATE_GRANDE: "EMBARCACION",
};

/** Traduce un slug viejo al actual. Los actuales pasan sin cambios. */
export function normalizeVehicleType(v: string | null | undefined): string | null {
  if (!v) return null;
  return VEHICLE_TYPES_LEGACY[v] ?? v;
}

export function isVehicleType(v: unknown): v is VehicleType {
  return typeof v === "string" && (VEHICLE_TYPES as readonly string[]).includes(v);
}
