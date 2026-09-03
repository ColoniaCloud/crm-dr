/**
 * Los tipos de vehiculo que puede elegir el instalador.
 *
 * La lista sale de los iconos que hay en `public/iconos/vehiculos` de
 * kristall-web: cada slug de aca tiene que tener su SVG del otro lado, porque
 * el desplegable se dibuja con esos iconos. **Si agregas uno, agregalo en los
 * dos lados** — sin icono el desplegable muestra un hueco, y sin slug aca el
 * endpoint rechaza la eleccion.
 *
 * Se guarda el slug y no el nombre: el nombre visible puede cambiar («Camion
 * Chico» a «Camioneta») sin tocar lo que ya esta guardado en la base.
 */
export const VEHICLE_TYPES = [
  "SEDAN",
  "HATCHBACK",
  "SUV",
  "FURGON",
  "VAN_MINIBUS",
  "CAMION_CHICO",
  "CAMION_GRANDE",
  "COLECTIVO",
  "YATE_CHICO",
  "YATE_GRANDE",
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];

export function isVehicleType(v: unknown): v is VehicleType {
  return typeof v === "string" && (VEHICLE_TYPES as readonly string[]).includes(v);
}
